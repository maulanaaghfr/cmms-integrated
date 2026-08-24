<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class BillingCriticalRegressionTest extends TestCase
{
    use RefreshDatabase;

    public function test_failed_callback_cannot_downgrade_a_paid_payment(): void
    {
        $fixture = $this->billingFixture('PAID');
        config()->set('payments.secrets.TEST_DUITKU_KEY', 'callback-secret');

        $payload = [
            'merchantOrderId' => $fixture['payment_reference'],
            'amount' => '500000',
            'resultCode' => '01',
            'reference' => 'FAILED-AFTER-PAID',
        ];
        $payload['signature'] = hash_hmac(
            'sha256',
            'DTEST500000'.$fixture['payment_reference'],
            'callback-secret'
        );

        $this->postJson('http://localhost/api/v1/billing/providers/DUITKU/callback', $payload)
            ->assertOk()
            ->assertJsonPath('data.received', true);

        $this->assertDatabaseHas('payments', ['id' => $fixture['payment_id'], 'status' => 'PAID']);
        $this->assertDatabaseHas('invoices', ['id' => $fixture['invoice_id'], 'status' => 'PAID']);
        $this->assertDatabaseHas('payment_events', [
            'payment_id' => $fixture['payment_id'],
            'processing_status' => 'PROCESSED',
        ]);
    }

    public function test_payment_idempotency_key_is_scoped_to_an_invoice(): void
    {
        $first = $this->billingFixture('PENDING', 'same-client-key');
        $secondInvoiceId = (string) Str::ulid();
        DB::table('invoices')->insert([
            'id' => $secondInvoiceId,
            'tenant_id' => $first['tenant_id'],
            'subscription_id' => $first['subscription_id'],
            'invoice_number' => 'INV-'.Str::upper(Str::random(12)),
            'status' => 'PENDING',
            'billing_period_start' => now(),
            'billing_period_end' => now()->addMonth(),
            'issued_at' => now(),
            'due_at' => now()->addDays(7),
            'paid_at' => null,
            'currency_code' => 'IDR',
            'subtotal' => 500000,
            'tax_amount' => 0,
            'total_amount' => 500000,
            'amount_paid' => 0,
            'customer_name_snapshot' => 'Regression Tenant',
            'customer_email_snapshot' => 'billing@example.test',
            'customer_tax_id_snapshot' => null,
            'billing_address_snapshot' => null,
            'notes' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('payments')->insert([
            'id' => (string) Str::ulid(),
            'invoice_id' => $secondInvoiceId,
            'payment_provider_id' => $first['provider_id'],
            'payment_channel_id' => $first['channel_id'],
            'payment_reference' => 'PAY-'.Str::upper(Str::random(20)),
            'provider_transaction_id' => null,
            'status' => 'PENDING',
            'currency_code' => 'IDR',
            'amount' => 500000,
            'provider_fee' => 0,
            'redirect_url' => null,
            'expires_at' => null,
            'paid_at' => null,
            'manually_confirmed_at' => null,
            'manually_confirmed_by' => null,
            'idempotency_key' => 'same-client-key',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertSame(2, DB::table('payments')->where('idempotency_key', 'same-client-key')->count());

        $this->expectException(QueryException::class);
        DB::table('payments')->insert([
            'id' => (string) Str::ulid(),
            'invoice_id' => $first['invoice_id'],
            'payment_provider_id' => $first['provider_id'],
            'payment_channel_id' => $first['channel_id'],
            'payment_reference' => 'PAY-'.Str::upper(Str::random(20)),
            'provider_transaction_id' => null,
            'status' => 'PENDING',
            'currency_code' => 'IDR',
            'amount' => 500000,
            'provider_fee' => 0,
            'redirect_url' => null,
            'expires_at' => null,
            'paid_at' => null,
            'manually_confirmed_at' => null,
            'manually_confirmed_by' => null,
            'idempotency_key' => 'same-client-key',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** @return array<string, string> */
    private function billingFixture(string $paymentStatus, string $idempotencyKey = 'callback-regression'): array
    {
        $tenantId = (string) Str::ulid();
        $planId = (string) Str::ulid();
        $subscriptionId = (string) Str::ulid();
        $providerId = (string) Str::ulid();
        $channelId = (string) Str::ulid();
        $invoiceId = (string) Str::ulid();
        $paymentId = (string) Str::ulid();
        $paymentReference = 'PAY-'.Str::upper(Str::random(20));

        DB::table('plans')->insert([
            'id' => $planId, 'key' => 'REGRESSION', 'version_number' => 1, 'name' => 'Regression',
            'description' => null, 'monthly_price' => 500000, 'annual_price' => null, 'currency_code' => 'IDR',
            'max_users' => null, 'max_assets' => null, 'max_sites' => null, 'status' => 'PUBLISHED',
            'is_public' => false, 'effective_from' => now(), 'effective_until' => null, 'published_at' => now(),
            'published_by' => null, 'lock_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('tenants')->insert([
            'id' => $tenantId, 'code' => 'REG-'.Str::upper(Str::random(8)), 'name' => 'Regression Tenant',
            'slug' => 'reg-'.Str::lower(Str::random(8)), 'email' => 'billing@example.test', 'phone' => null,
            'industry' => null, 'timezone' => 'Asia/Jakarta', 'status' => 'ACTIVE',
            'database_name' => 'test_'.Str::lower(Str::random(12)), 'database_status' => 'READY',
            'settings' => null, 'provisioned_at' => now(), 'created_by' => null, 'lock_version' => 1,
            'archived_at' => null, 'created_at' => now(), 'updated_at' => now(), 'data' => null,
        ]);
        DB::table('subscriptions')->insert([
            'id' => $subscriptionId, 'tenant_id' => $tenantId, 'plan_id' => $planId, 'status' => 'ACTIVE',
            'billing_period' => 'MONTHLY', 'price_snapshot' => 500000, 'currency_code' => 'IDR',
            'starts_at' => now(), 'trial_ends_at' => null, 'current_period_start' => now(),
            'current_period_end' => now()->addMonth(), 'grace_ends_at' => null, 'auto_renew' => true,
            'cancelled_at' => null, 'cancellation_reason' => null, 'notes' => null,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('payment_providers')->insert([
            'id' => $providerId, 'key' => 'DUITKU', 'name' => 'Duitku', 'supports_redirect' => true,
            'supports_webhook' => true, 'supports_status_check' => true, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('payment_provider_configs')->insert([
            'id' => (string) Str::ulid(), 'payment_provider_id' => $providerId, 'environment' => 'SANDBOX',
            'merchant_identifier' => 'DTEST', 'secret_reference' => 'env:TEST_DUITKU_KEY',
            'callback_base_url' => 'http://localhost', 'return_base_url' => 'http://localhost/billing',
            'settings' => null, 'is_active' => true, 'created_by' => null,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('payment_channels')->insert([
            'id' => $channelId, 'payment_provider_id' => $providerId, 'channel_key' => 'VC',
            'name' => 'Test Channel', 'channel_type' => 'CARD', 'bank_code' => null, 'fee_config' => null,
            'minimum_amount' => 10000, 'maximum_amount' => null, 'is_active' => true,
            'synced_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('invoices')->insert([
            'id' => $invoiceId, 'tenant_id' => $tenantId, 'subscription_id' => $subscriptionId,
            'invoice_number' => 'INV-'.Str::upper(Str::random(12)), 'status' => $paymentStatus === 'PAID' ? 'PAID' : 'PENDING',
            'billing_period_start' => now(), 'billing_period_end' => now()->addMonth(), 'issued_at' => now(),
            'due_at' => now()->addDays(7), 'paid_at' => $paymentStatus === 'PAID' ? now() : null,
            'currency_code' => 'IDR', 'subtotal' => 500000, 'tax_amount' => 0, 'total_amount' => 500000,
            'amount_paid' => $paymentStatus === 'PAID' ? 500000 : 0, 'customer_name_snapshot' => 'Regression Tenant',
            'customer_email_snapshot' => 'billing@example.test', 'customer_tax_id_snapshot' => null,
            'billing_address_snapshot' => null, 'notes' => null, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('payments')->insert([
            'id' => $paymentId, 'invoice_id' => $invoiceId, 'payment_provider_id' => $providerId,
            'payment_channel_id' => $channelId, 'payment_reference' => $paymentReference,
            'provider_transaction_id' => null, 'status' => $paymentStatus, 'currency_code' => 'IDR',
            'amount' => 500000, 'provider_fee' => 0, 'redirect_url' => null, 'expires_at' => null,
            'paid_at' => $paymentStatus === 'PAID' ? now() : null, 'manually_confirmed_at' => null,
            'manually_confirmed_by' => null, 'idempotency_key' => $idempotencyKey,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return [
            'tenant_id' => $tenantId,
            'subscription_id' => $subscriptionId,
            'provider_id' => $providerId,
            'channel_id' => $channelId,
            'invoice_id' => $invoiceId,
            'payment_id' => $paymentId,
            'payment_reference' => $paymentReference,
        ];
    }
}
