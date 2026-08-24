<!doctype html>
<html lang="en">
<body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6">
    <h1>Verify your email</h1>
    <p>Hello {{ $recipientName }},</p>
    <p>Verify this email address to continue setting up <strong>{{ $companyName }}</strong> on AITOMA CMMS.</p>
    <p><a href="{{ $verificationUrl }}" style="display:inline-block;padding:12px 20px;background:#155eef;color:#fff;text-decoration:none;border-radius:6px">Verify email</a></p>
    <p>This link expires in {{ $expiresInMinutes }} minutes. If you did not request this registration, you can ignore this email.</p>
    <p>AITOMA CMMS</p>
</body>
</html>
