<?php

namespace Tests\Unit;

use App\Services\DuitkuService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DuitkuServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config()->set('payments.secrets.DUITKU_API_KEY', 'test-secret');
    }

    public function test_transaction_and_status_requests_use_current_hmac_sha256_signatures(): void
    {
        Http::fake([
            'https://duitku.test/transaction' => Http::response(['reference' => 'REF-1', 'paymentUrl' => 'https://pay.test/1']),
            'https://duitku.test/status' => Http::response(['merchantOrderId' => 'PAY-1', 'reference' => 'REF-1', 'amount' => '500000', 'fee' => '0', 'statusCode' => '00', 'statusMessage' => 'SUCCESS']),
        ]);
        $config = (object) [
            'merchant_identifier' => 'D1234', 'secret_reference' => 'env:DUITKU_API_KEY',
            'callback_base_url' => 'https://api.test', 'return_base_url' => 'https://app.test/billing',
            'environment' => 'SANDBOX',
            'settings' => json_encode(['transaction_url' => 'https://duitku.test/transaction', 'status_url' => 'https://duitku.test/status']),
        ];
        $payment = (object) ['payment_reference' => 'PAY-1', 'amount' => '500000.0000'];
        $invoice = (object) ['invoice_number' => 'INV-1', 'customer_email_snapshot' => 'billing@example.test', 'customer_name_snapshot' => 'PT Example Indonesia'];
        $channel = (object) ['channel_key' => 'VC'];
        $service = app(DuitkuService::class);

        $this->assertSame('REF-1', $service->createTransaction($config, $payment, $invoice, $channel)['reference']);
        $this->assertSame('00', $service->checkTransaction($config, $payment)['statusCode']);

        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://duitku.test/transaction'
            && $request['customerVaName'] === 'PT Example Indonesia'
            && $request['signature'] === hash_hmac('sha256', 'D1234PAY-1500000', 'test-secret'));
        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://duitku.test/status'
            && $request['signature'] === hash_hmac('sha256', 'D1234PAY-1', 'test-secret'));
        $this->assertSame(hash_hmac('sha256', 'D1234500000PAY-1', 'test-secret'), $service->callbackSignature($config, 'PAY-1', '500000'));
    }
}
