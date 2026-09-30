<?php

declare(strict_types=1);

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PlanChangedEmail extends Mailable
{
    use Queueable, SerializesModels;

    /** @param list<string> $changes */
    public function __construct(
        public readonly string $companyName,
        public readonly string $planName,
        public readonly array $changes,
        public readonly string $effectiveDate,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            from: new Address((string) config('mail.from.address'), (string) config('mail.from.name')),
            subject: 'Perubahan paket langganan '.$this->planName,
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.plan-changed');
    }
}
