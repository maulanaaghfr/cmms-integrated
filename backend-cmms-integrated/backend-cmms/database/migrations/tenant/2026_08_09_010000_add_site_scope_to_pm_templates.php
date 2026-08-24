<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pm_templates', function (Blueprint $table): void {
            $table->foreignUlid('site_id')->nullable()->after('id')->constrained('sites')->restrictOnDelete();
            $table->index(['site_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('pm_templates', function (Blueprint $table): void {
            $table->dropIndex(['site_id', 'status']);
            $table->dropConstrainedForeignId('site_id');
        });
    }
};
