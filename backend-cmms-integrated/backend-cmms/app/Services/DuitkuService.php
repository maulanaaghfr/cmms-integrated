<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class DuitkuService
{
    public function secret(object $config): string
    {
        if (! str_starts_with($config->secret_reference, 'env:')) {
            throw new ApiException('PAYMENT_SECRET_REFERENCE_INVALID', 'Payment secret must use an env: reference.', 500);
        }
        $secret = config('payments.secrets.'.substr($config->secret_reference, 4));
        if (! is_string($secret) || $secret === '') {
            throw new ApiException('PAYMENT_SECRET_UNAVAILABLE', 'Duitku API secret is not configured in the environment.', 503);
        }

        return $secret;
    }

    public function createTransaction(object $config, object $payment, object $invoice, object $channel): array
    {
        $settings = json_decode($config->settings ?: '{}', true);
        if (empty($settings['transaction_url'])) {
            throw new ApiException('PAYMENT_PROVIDER_NOT_CONFIGURED', 'Duitku transaction URL is not configured.', 503);
        }
        $amount = (int) round((float) $payment->amount);
        $payload = [
            'merchantCode' => $config->merchant_identifier, 'paymentAmount' => $amount,
            'merchantOrderId' => $payment->payment_reference, 'productDetails' => $invoice->invoice_number,
            'email' => $invoice->customer_email_snapshot, 'paymentMethod' => $channel->channel_key,
            'customerVaName' => Str::limit($invoice->customer_name_snapshot, 20, ''),
            'callbackUrl' => rtrim($config->callback_base_url, '/').'/api/v1/billing/providers/DUITKU/callback',
            'returnUrl' => $config->return_base_url,
            'signature' => hash_hmac('sha256', $config->merchant_identifier.$payment->payment_reference.$amount, $this->secret($config)),
        ];
        $response = Http::acceptJson()->timeout(20)->post($settings['transaction_url'], $payload);
        if (! $response->successful()) {
            throw new ApiException('PAYMENT_PROVIDER_ERROR', 'Duitku rejected the transaction request.', 502, ['provider_status' => $response->status()]);
        }

        return $response->json();
    }

    public function callbackSignature(object $config, string $orderId, string $amount): string
    {
        return hash_hmac('sha256', $config->merchant_identifier.$amount.$orderId, $this->secret($config));
    }

    public function checkTransaction(object $config, object $payment): array
    {
        $settings = json_decode($config->settings ?: '{}', true);
        $url = $settings['status_url'] ?? match ($config->environment) {
            'SANDBOX' => 'https://sandbox.duitku.com/webapi/api/merchant/transactionStatus',
            'PRODUCTION' => 'https://passport.duitku.com/webapi/api/merchant/transactionStatus',
            default => null,
        };
        if (! $url) {
            throw new ApiException('PAYMENT_PROVIDER_NOT_CONFIGURED', 'Duitku status URL is not configured.', 503);
        }

        $secret = $this->secret($config);
        $payload = [
            'merchantCode' => $config->merchant_identifier,
            'merchantOrderId' => $payment->payment_reference,
            'signature' => hash_hmac('sha256', $config->merchant_identifier.$payment->payment_reference, $secret),
        ];
        $response = Http::acceptJson()->asJson()->timeout(20)->post($url, $payload);
        if (! $response->successful()) {
            throw new ApiException('PAYMENT_PROVIDER_ERROR', 'Duitku transaction status check failed.', 502, ['provider_status' => $response->status()]);
        }

        return $response->json();
    }
}
