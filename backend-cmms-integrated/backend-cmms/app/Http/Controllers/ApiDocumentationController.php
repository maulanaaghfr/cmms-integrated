<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Support\OpenApiDocument;

class ApiDocumentationController extends Controller
{
    public function specification(OpenApiDocument $document): mixed
    {
        return response()->json($document->build(), 200, [], JSON_UNESCAPED_SLASHES);
    }

    public function ui(): mixed
    {
        $specification = url('/api/documentation/openapi.json');

        return response(<<<HTML
<!doctype html><html><head><meta charset="utf-8"><title>AITOMA CMMS API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url: '{$specification}', dom_id: '#swagger-ui', persistAuthorization: true, displayRequestDuration: true});</script></body></html>
HTML)->header('Content-Type', 'text/html');
    }
}
