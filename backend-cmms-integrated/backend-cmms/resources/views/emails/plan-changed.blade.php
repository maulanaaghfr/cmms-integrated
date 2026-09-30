<!doctype html>
<html lang="id">
<body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5">
<p>Halo Admin {{ $companyName }},</p>
<p>Paket <strong>{{ $planName }}</strong> yang Anda gunakan mengalami perubahan:</p>
<ul>@foreach ($changes as $line)<li>{{ $line }}</li>@endforeach</ul>
<p>Perubahan mulai berlaku pada <strong>{{ $effectiveDate }}</strong>. Sampai tanggal tersebut, langganan Anda tetap memakai harga, layanan, dan limit periode berjalan. Tidak ada penyesuaian tagihan untuk periode yang sedang berjalan sesuai Syarat &amp; Ketentuan.</p>
<p>Salam,<br>AITOMA CMMS</p>
</body>
</html>
