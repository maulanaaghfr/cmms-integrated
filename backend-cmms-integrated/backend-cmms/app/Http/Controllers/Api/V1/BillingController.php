<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Services\AuditService;
use App\Services\DuitkuService;
use App\Support\ApiData;
use Illuminate\Database\Connection;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BillingController extends Controller
{
    public function __construct(private readonly DuitkuService $duitku, private readonly AuditService $audit) {}

    public function providerConfig(string $provider): mixed
    {
        $providerRow = $this->provider($provider);
        $configs = $this->central()->table('payment_provider_configs')
            ->where('payment_provider_id', $providerRow->id)
            ->orderByDesc('created_at')
            ->get();

        return ApiData::item(['provider' => $providerRow, 'configs' => $configs]);
    }

    public function upsertProviderConfig(Request $request, string $provider): mixed
    {
        $providerRow = $this->provider($provider);
        $data = $request->validate([
            'environment' => ['required', Rule::in(['SANDBOX', 'PRODUCTION'])],
            'merchant_identifier' => ['required', 'string', 'max:255'],
            'secret_reference' => ['required', Rule::in(['env:DUITKU_API_KEY'])],
            'callback_base_url' => ['required', 'url', 'max:1024'],
            'return_base_url' => ['required', 'url', 'max:1024'],
            'settings' => ['required', 'array'],
            'settings.transaction_url' => ['required', 'url'],
            'settings.status_url' => ['nullable', 'url'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        $central = $this->central();
        $before = $central->table('payment_provider_configs')->where('payment_provider_id', $providerRow->id)->where('environment', $data['environment'])->orderByDesc('created_at')->first();
        $id = $before?->id ?? (string) Str::ulid();
        $central->transaction(function () use ($central, $providerRow, $data, $id, $request, $before): void {
            if ($data['is_active'] ?? true) {
                $central->table('payment_provider_configs')->where('payment_provider_id', $providerRow->id)->where('environment', $data['environment'])->update(['is_active' => false, 'updated_at' => now()]);
            }
            $central->table('payment_provider_configs')->updateOrInsert(['id' => $id], [
                'payment_provider_id' => $providerRow->id, 'environment' => $data['environment'],
                'merchant_identifier' => $data['merchant_identifier'], 'secret_reference' => $data['secret_reference'],
                'callback_base_url' => $data['callback_base_url'], 'return_base_url' => $data['return_base_url'],
                'settings' => json_encode($data['settings']), 'is_active' => $data['is_active'] ?? true,
                'created_by' => $request->user()->id, 'created_at' => $before?->created_at ?? now(), 'updated_at' => now(),
            ]);
        });
        $updated = $central->table('payment_provider_configs')->where('id', $id)->first();
        $this->audit->platform($request, 'payment_provider.configured', 'PAYMENT_PROVIDER_CONFIG', $id, $before, $updated);

        return ApiData::item($updated, $before ? 200 : 201);
    }

    public function providerChannels(string $provider): mixed
    {
        $providerRow = $this->provider($provider);

        return ApiData::item($this->central()->table('payment_channels')->where('payment_provider_id', $providerRow->id)->orderBy('name')->get());
    }

    public function upsertProviderChannel(Request $request, string $provider, string $channelKey): mixed
    {
        $providerRow = $this->provider($provider);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'channel_type' => ['required', Rule::in(['VIRTUAL_ACCOUNT', 'EWALLET', 'QRIS', 'RETAIL', 'CARD', 'OTHER'])],
            'bank_code' => ['nullable', 'string', 'max:30'], 'fee_config' => ['nullable', 'array'],
            'minimum_amount' => ['nullable', 'numeric', 'min:0'],
            'maximum_amount' => ['nullable', 'numeric', 'gte:minimum_amount'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        if (! preg_match('/^[A-Z0-9_-]{1,80}$/', $channelKey)) {
            throw new ApiException('PAYMENT_CHANNEL_KEY_INVALID', 'Channel key must contain only uppercase letters, numbers, underscores, or hyphens.', 422);
        }
        $central = $this->central();
        $before = $central->table('payment_channels')->where('payment_provider_id', $providerRow->id)->where('channel_key', $channelKey)->first();
        $id = $before?->id ?? (string) Str::ulid();
        $central->table('payment_channels')->updateOrInsert(['payment_provider_id' => $providerRow->id, 'channel_key' => $channelKey], [
            'id' => $id, 'name' => $data['name'], 'channel_type' => $data['channel_type'],
            'bank_code' => $data['bank_code'] ?? null, 'fee_config' => isset($data['fee_config']) ? json_encode($data['fee_config']) : null,
            'minimum_amount' => $data['minimum_amount'] ?? null, 'maximum_amount' => $data['maximum_amount'] ?? null,
            'is_active' => $data['is_active'] ?? true, 'synced_at' => now(),
            'created_at' => $before?->created_at ?? now(), 'updated_at' => now(),
        ]);
        $updated = $central->table('payment_channels')->where('id', $id)->first();
        $this->audit->platform($request, 'payment_channel.configured', 'PAYMENT_CHANNEL', $id, $before, $updated);

        return ApiData::item($updated, $before ? 200 : 201);
    }

    public function subscription(): mixed
    {
        return ApiData::item($this->central()->table('subscriptions')->join('plans', 'plans.id', '=', 'subscriptions.plan_id')->where('subscriptions.tenant_id', tenant('id'))->orderByDesc('subscriptions.starts_at')->select('subscriptions.*', 'plans.key as plan_key', 'plans.name as plan_name')->first());
    }

    public function invoices(Request $request): mixed
    {
        return ApiData::paginated($this->central()->table('invoices')->where('tenant_id', tenant('id'))->orderByDesc('created_at')->paginate($request->integer('per_page', 20)));
    }

    public function invoice(string $invoice): mixed
    {
        $row = $this->tenantInvoice($invoice);
        $row->lines = $this->central()->table('invoice_lines')->where('invoice_id', $invoice)->orderBy('sort_order')->get();
        $row->payments = $this->central()->table('payments')->where('invoice_id', $invoice)->orderByDesc('created_at')->get();

        return ApiData::item($row);
    }

    public function channels(): mixed
    {
        return ApiData::item($this->central()->table('payment_channels')->join('payment_providers', 'payment_providers.id', '=', 'payment_channels.payment_provider_id')->where('payment_channels.is_active', true)->where('payment_providers.is_active', true)->select('payment_channels.*', 'payment_providers.key as provider_key')->orderBy('payment_channels.name')->get());
    }

    public function createPayment(Request $request, string $invoice): mixed
    {
        $data = $request->validate(['payment_channel_id' => ['required', 'ulid'], 'idempotency_key' => ['required', 'string', 'max:160']]);
        $central = $this->central();
        $invoiceRow = $this->tenantInvoice($invoice);
        if ($existing = $central->table('payments')->where('invoice_id', $invoiceRow->id)->where('idempotency_key', $data['idempotency_key'])->first()) {
            if ($existing->payment_channel_id !== $data['payment_channel_id']) {
                throw new ApiException('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with a different payment channel.', 409);
            }

            return ApiData::item($existing);
        }
        if (! in_array($invoiceRow->status, ['ISSUED', 'PENDING', 'OVERDUE', 'FAILED'], true)) {
            throw new ApiException('INVOICE_NOT_PAYABLE', 'This invoice cannot accept a payment.', 409);
        }
        $channel = $central->table('payment_channels')->where('id', $data['payment_channel_id'])->where('is_active', true)->first();
        if (! $channel) {
            throw new ApiException('PAYMENT_CHANNEL_NOT_FOUND', 'Payment channel was not found.', 404);
        }
        $provider = $central->table('payment_providers')->where('id', $channel->payment_provider_id)->where('key', 'DUITKU')->first();
        $config = $central->table('payment_provider_configs')->where('payment_provider_id', $provider?->id)->where('is_active', true)->orderByDesc('created_at')->first();
        if (! $provider || ! $config) {
            throw new ApiException('PAYMENT_PROVIDER_NOT_CONFIGURED', 'Active Duitku configuration was not found.', 503);
        }
        $id = (string) Str::ulid();
        $reference = 'PAY-'.Str::upper(Str::random(20));
        try {
            $central->table('payments')->insert(['id' => $id, 'invoice_id' => $invoice, 'payment_provider_id' => $provider->id, 'payment_channel_id' => $channel->id, 'payment_reference' => $reference, 'provider_transaction_id' => null, 'status' => 'CREATED', 'currency_code' => $invoiceRow->currency_code, 'amount' => $invoiceRow->total_amount - $invoiceRow->amount_paid, 'provider_fee' => 0, 'redirect_url' => null, 'expires_at' => null, 'paid_at' => null, 'manually_confirmed_at' => null, 'manually_confirmed_by' => null, 'idempotency_key' => $data['idempotency_key'], 'created_at' => now(), 'updated_at' => now()]);
        } catch (UniqueConstraintViolationException $exception) {
            $existing = $central->table('payments')->where('invoice_id', $invoiceRow->id)->where('idempotency_key', $data['idempotency_key'])->first();
            if (! $existing) {
                throw $exception;
            }
            if ($existing->payment_channel_id !== $data['payment_channel_id']) {
                throw new ApiException('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with a different payment channel.', 409);
            }

            return ApiData::item($existing);
        }
        $payment = $central->table('payments')->where('id', $id)->first();
        try {
            $result = $this->duitku->createTransaction($config, $payment, $invoiceRow, $channel);
            $central->table('payments')->where('id', $id)->update(['status' => 'PENDING', 'provider_transaction_id' => $result['reference'] ?? null, 'redirect_url' => $result['paymentUrl'] ?? $result['redirectUrl'] ?? null, 'expires_at' => isset($result['expiryPeriod']) ? now()->addMinutes((int) $result['expiryPeriod']) : null, 'updated_at' => now()]);
            $central->table('invoices')->where('id', $invoice)->update(['status' => 'PENDING', 'updated_at' => now()]);
        } catch (\Throwable $exception) {
            $central->table('payments')->where('id', $id)->update(['status' => 'FAILED', 'updated_at' => now()]);
            throw $exception;
        }

        return ApiData::item($central->table('payments')->where('id', $id)->first(), 201);
    }

    public function payment(string $payment): mixed
    {
        $row = $this->central()->table('payments')->join('invoices', 'invoices.id', '=', 'payments.invoice_id')->where('payments.id', $payment)->where('invoices.tenant_id', tenant('id'))->select('payments.*')->first();

        return ApiData::item($row ?? throw new ApiException('PAYMENT_NOT_FOUND', 'Payment was not found.', 404));
    }

    public function checkStatus(string $payment): mixed
    {
        $central = $this->central();
        $row = $central->table('payments')->join('invoices', 'invoices.id', '=', 'payments.invoice_id')->where('payments.id', $payment)->where('invoices.tenant_id', tenant('id'))->select('payments.*')->first();
        if (! $row) {
            throw new ApiException('PAYMENT_NOT_FOUND', 'Payment was not found.', 404);
        }
        $invoice = $central->table('invoices')->where('id', $row->invoice_id)->first();
        $provider = $central->table('payment_providers')->where('id', $row->payment_provider_id)->where('key', 'DUITKU')->first();
        $config = $central->table('payment_provider_configs')->where('payment_provider_id', $provider?->id)->where('is_active', true)->orderByDesc('created_at')->first();
        if (! $provider || ! $config) {
            throw new ApiException('PAYMENT_PROVIDER_NOT_CONFIGURED', 'Active Duitku configuration was not found.', 503);
        }

        $result = $this->duitku->checkTransaction($config, $row);
        $orderValid = ($result['merchantOrderId'] ?? null) === $row->payment_reference;
        $amountValid = number_format((float) ($result['amount'] ?? -1), 4, '.', '') === number_format((float) $row->amount, 4, '.', '');
        $eventId = (string) Str::ulid();
        $central->table('payment_events')->insert([
            'id' => $eventId, 'payment_id' => $row->id, 'payment_provider_id' => $provider->id,
            'provider_event_id' => $result['reference'] ?? null, 'event_type' => 'STATUS_CHECK',
            'signature_valid' => true, 'amount_valid' => $amountValid, 'invoice_valid' => (bool) $invoice,
            'tenant_valid' => (bool) $invoice, 'idempotency_key' => 'duitku:status:'.$eventId,
            'request_headers' => null, 'payload' => json_encode($result),
            'processing_status' => $orderValid && $amountValid && $invoice ? 'PROCESSED' : 'FAILED',
            'failure_message' => $orderValid && $amountValid && $invoice ? null : 'Provider order, amount, or invoice validation failed.',
            'received_at' => now(), 'processed_at' => now(),
        ]);
        if (! $orderValid || ! $amountValid || ! $invoice) {
            throw new ApiException('PAYMENT_STATUS_INVALID', 'Duitku returned data that does not match this payment.', 422);
        }

        $status = match ((string) ($result['statusCode'] ?? '')) {
            '00' => 'PAID',
            '01' => 'PENDING',
            '02' => str_contains(Str::upper((string) ($result['statusMessage'] ?? '')), 'EXPIR') ? 'EXPIRED' : 'FAILED',
            default => throw new ApiException('PAYMENT_STATUS_UNKNOWN', 'Duitku returned an unknown payment status.', 502, ['status_code' => $result['statusCode'] ?? null]),
        };
        if ($status === 'PAID') {
            $central->transaction(fn () => $this->settlePayment($central, $row, $invoice));
        } elseif ($row->status !== 'PAID') {
            $central->table('payments')->where('id', $row->id)->update(['status' => $status, 'updated_at' => now()]);
        }

        return ApiData::item(['payment' => $central->table('payments')->where('id', $row->id)->first(), 'provider' => $result]);
    }

    public function manualConfirm(Request $request, string $payment): mixed
    {
        $data = $request->validate(['note' => ['required', 'string', 'max:1000']]);
        $central = $this->central();
        $row = $central->table('payments')->where('id', $payment)->first();
        $invoice = $row ? $central->table('invoices')->where('id', $row->invoice_id)->first() : null;
        if (! $row || ! $invoice) {
            throw new ApiException('PAYMENT_NOT_FOUND', 'Payment was not found.', 404);
        }
        $before = clone $row;
        $eventId = (string) Str::ulid();
        $central->transaction(function () use ($central, $row, $invoice, $request, $eventId, $data): void {
            $this->settlePayment($central, $row, $invoice, $request->user()->id);
            $central->table('payment_events')->insert([
                'id' => $eventId, 'payment_id' => $row->id, 'payment_provider_id' => $row->payment_provider_id,
                'provider_event_id' => null, 'event_type' => 'MANUAL_CONFIRMATION', 'signature_valid' => true,
                'amount_valid' => true, 'invoice_valid' => true, 'tenant_valid' => true,
                'idempotency_key' => 'manual:'.$eventId, 'request_headers' => null,
                'payload' => json_encode(['note' => $data['note'], 'actor_user_id' => $request->user()->id]),
                'processing_status' => 'PROCESSED', 'failure_message' => null, 'received_at' => now(), 'processed_at' => now(),
            ]);
        });
        $updated = $central->table('payments')->where('id', $row->id)->first();
        $this->audit->platform($request, 'payment.manually_confirmed', 'PAYMENT', $row->id, $before, $updated, $invoice->tenant_id);

        return ApiData::item($updated);
    }

    public function callback(Request $request, string $provider): mixed
    {
        if (Str::upper($provider) !== 'DUITKU') {
            throw new ApiException('PAYMENT_PROVIDER_NOT_FOUND', 'Payment provider was not found.', 404);
        }
        $data = $request->validate(['merchantOrderId' => ['required', 'string'], 'amount' => ['required'], 'resultCode' => ['required', 'string'], 'signature' => ['required', 'string']]);
        $central = $this->central();
        $providerRow = $central->table('payment_providers')->where('key', 'DUITKU')->first();
        $config = $central->table('payment_provider_configs')->where('payment_provider_id', $providerRow?->id)->where('is_active', true)->first();
        if (! $config) {
            throw new ApiException('PAYMENT_PROVIDER_NOT_CONFIGURED', 'Active Duitku configuration was not found.', 503);
        }
        $payment = $central->table('payments')->where('payment_reference', $data['merchantOrderId'])->first();
        $invoice = $payment ? $central->table('invoices')->where('id', $payment->invoice_id)->first() : null;
        $idempotency = 'duitku:'.hash('sha256', json_encode($request->all()));
        if ($central->table('payment_events')->where('idempotency_key', $idempotency)->exists()) {
            return ApiData::item(['received' => true, 'duplicate' => true]);
        }
        $signatureValid = hash_equals($this->duitku->callbackSignature($config, $data['merchantOrderId'], (string) $data['amount']), $data['signature']);
        $amountValid = $payment && number_format((float) $payment->amount, 4, '.', '') === number_format((float) $data['amount'], 4, '.', '');
        $eventId = (string) Str::ulid();
        $central->table('payment_events')->insert(['id' => $eventId, 'payment_id' => $payment?->id, 'payment_provider_id' => $providerRow->id, 'provider_event_id' => $request->input('reference'), 'event_type' => 'CALLBACK', 'signature_valid' => $signatureValid, 'amount_valid' => $amountValid, 'invoice_valid' => (bool) $invoice, 'tenant_valid' => (bool) $invoice, 'idempotency_key' => $idempotency, 'request_headers' => json_encode($request->headers->all()), 'payload' => json_encode($request->except(['apiKey', 'secret'])), 'processing_status' => 'RECEIVED', 'failure_message' => null, 'received_at' => now(), 'processed_at' => null]);
        if (! $signatureValid || ! $amountValid || ! $invoice) {
            $central->table('payment_events')->where('id', $eventId)->update(['processing_status' => 'FAILED', 'failure_message' => 'Signature, amount, or invoice validation failed.', 'processed_at' => now()]);
            throw new ApiException('PAYMENT_CALLBACK_INVALID', 'Payment callback validation failed.', 422);
        }
        if ($data['resultCode'] === '00') {
            $central->transaction(function () use ($central, $payment, $invoice, $eventId): void {
                $this->settlePayment($central, $payment, $invoice);
                $central->table('payment_events')->where('id', $eventId)->update(['processing_status' => 'PROCESSED', 'processed_at' => now()]);
            });
        } else {
            $central->transaction(function () use ($central, $payment, $eventId): void {
                $lockedPayment = $central->table('payments')->where('id', $payment->id)->lockForUpdate()->first();
                if ($lockedPayment && $lockedPayment->status !== 'PAID') {
                    $central->table('payments')->where('id', $payment->id)->update(['status' => 'FAILED', 'updated_at' => now()]);
                }
                $central->table('payment_events')->where('id', $eventId)->update(['processing_status' => 'PROCESSED', 'processed_at' => now()]);
            });
        }

        return ApiData::item(['received' => true]);
    }

    private function tenantInvoice(string $id): object
    {
        return $this->central()->table('invoices')->where('id', $id)->where('tenant_id', tenant('id'))->first() ?? throw new ApiException('INVOICE_NOT_FOUND', 'Invoice was not found.', 404);
    }

    private function provider(string $key): object
    {
        return $this->central()->table('payment_providers')->where('key', Str::upper($key))->first()
            ?? throw new ApiException('PAYMENT_PROVIDER_NOT_FOUND', 'Payment provider was not found.', 404);
    }

    private function central(): Connection
    {
        return DB::connection(config('tenancy.database.central_connection'));
    }

    private function settlePayment(Connection $central, object $payment, object $invoice, ?string $confirmedBy = null): void
    {
        $lockedPayment = $central->table('payments')->where('id', $payment->id)->lockForUpdate()->first();
        $lockedInvoice = $central->table('invoices')->where('id', $invoice->id)->lockForUpdate()->first();
        if ($lockedPayment->status === 'PAID') {
            return;
        }
        if ($central->table('payments')->where('invoice_id', $invoice->id)->where('status', 'PAID')->where('id', '<>', $payment->id)->exists()) {
            throw new ApiException('INVOICE_ALREADY_PAID', 'This invoice already has a successful payment.', 409);
        }

        $central->table('payments')->where('id', $payment->id)->update([
            'status' => 'PAID', 'paid_at' => now(),
            'manually_confirmed_at' => $confirmedBy ? now() : $lockedPayment->manually_confirmed_at,
            'manually_confirmed_by' => $confirmedBy ?: $lockedPayment->manually_confirmed_by,
            'updated_at' => now(),
        ]);
        $central->table('invoices')->where('id', $invoice->id)->update([
            'status' => 'PAID', 'paid_at' => now(), 'amount_paid' => $lockedInvoice->total_amount, 'updated_at' => now(),
        ]);
        $central->table('subscriptions')->where('id', $invoice->subscription_id)->update([
            'status' => 'ACTIVE', 'current_period_start' => $invoice->billing_period_start,
            'current_period_end' => $invoice->billing_period_end, 'updated_at' => now(),
        ]);
    }
}
