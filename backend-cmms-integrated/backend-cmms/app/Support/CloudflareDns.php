<?php

namespace App\Support;

class CloudflareDns
{
    public static function registerTenant(string $domain): void
    {
        $token = env('CLOUDFLARE_API_TOKEN');
        $zoneId = env('CLOUDFLARE_ZONE_ID');
        $ip = env('CLOUDFLARE_VPS_IP');
        if (! $token || ! $zoneId || ! $ip) {
            return;
        }
        try {
            \Illuminate\Support\Facades\Http::withToken($token)->post(
                "https://api.cloudflare.com/client/v4/zones/{$zoneId}/dns_records",
                [
                    'type' => 'A',
                    'name' => $domain,
                    'content' => $ip,
                    'proxied' => true,
                    'ttl' => 1,
                ]
            );
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Cloudflare DNS auto-create failed: '.$e->getMessage());
        }
    }
}
