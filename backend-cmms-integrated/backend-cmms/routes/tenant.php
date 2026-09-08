<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\AnalyticsController;
use App\Http\Controllers\Api\V1\AssetController;
use App\Http\Controllers\Api\V1\BillingController;
use App\Http\Controllers\Api\V1\InventoryController;
use App\Http\Controllers\Api\V1\MaintenanceRequestController;
use App\Http\Controllers\Api\V1\ManufacturerController;
use App\Http\Controllers\Api\V1\OrganizationController;
use App\Http\Controllers\Api\V1\PmController;
use App\Http\Controllers\Api\V1\ProcurementController;
use App\Http\Controllers\Api\V1\SupportController;
use App\Http\Controllers\Api\V1\WorkOrderController;
use Illuminate\Support\Facades\Route;
use Stancl\Tenancy\Middleware\InitializeTenancyByDomain;
use Stancl\Tenancy\Middleware\PreventAccessFromCentralDomains;

Route::middleware(['api', InitializeTenancyByDomain::class, PreventAccessFromCentralDomains::class, 'auth:sanctum'])
    ->prefix('api/v1')->group(function (): void {
        Route::middleware('tenant.access')->group(function (): void {
            Route::get('sites', [OrganizationController::class, 'sites'])->middleware('tenant.feature:core.assets');
            Route::get('sites/{site}', [OrganizationController::class, 'site'])->middleware('tenant.feature:core.assets');
            Route::get('locations', [OrganizationController::class, 'locations'])->middleware('tenant.feature:core.assets');
            Route::get('locations/{location}', [OrganizationController::class, 'location'])->middleware('tenant.feature:core.assets');
            // Must be registered before 'users/{user}' or the {user} wildcard
            // would swallow the literal "me" segment. Not gated behind the
            // core.teams feature flag: resolving "who am I" is basic session
            // identity, not a Teams-management feature, and every role
            // (including TECHNICIAN with no team yet) must always be able
            // to call it.
            Route::get('users/me', [OrganizationController::class, 'me']);
            Route::get('users', [OrganizationController::class, 'users'])->middleware('tenant.feature:core.teams');
            Route::get('users/{user}', [OrganizationController::class, 'user'])->middleware('tenant.feature:core.teams');
            Route::get('teams', [OrganizationController::class, 'teams'])->middleware('tenant.feature:core.teams');
            Route::get('teams/{team}', [OrganizationController::class, 'team'])->middleware('tenant.feature:core.teams');
            Route::get('asset-categories', [AssetController::class, 'categories'])->middleware('tenant.feature:core.assets');
            Route::get('asset-categories/{category}', [AssetController::class, 'category'])->middleware('tenant.feature:core.assets');
            Route::get('assets', [AssetController::class, 'index'])->middleware('tenant.feature:core.assets');
            Route::get('assets/{asset}', [AssetController::class, 'show'])->middleware('tenant.feature:core.assets');
            Route::get('assets/{asset}/operators', [AssetController::class, 'operators'])->middleware('tenant.feature:core.assets');

            // ---------- Inventory (Warehouses & Spare Parts) ----------
            Route::get('warehouses', [InventoryController::class, 'warehouses'])->middleware('tenant.feature:core.inventory');
            Route::get('warehouses/{warehouse}', [InventoryController::class, 'warehouse'])->middleware('tenant.feature:core.inventory');
            Route::get('spare-part-categories', [InventoryController::class, 'categories'])->middleware('tenant.feature:core.inventory');
            Route::get('spare-parts', [InventoryController::class, 'index'])->middleware('tenant.feature:core.inventory');
            Route::get('spare-parts/{sparePart}', [InventoryController::class, 'show'])->middleware('tenant.feature:core.inventory');
            Route::get('spare-parts/{sparePart}/movements', [InventoryController::class, 'movements'])->middleware('tenant.feature:core.inventory');

            Route::middleware('tenant.role:COMPANY_ADMIN,MANAGER')->group(function (): void {
                Route::post('users', [OrganizationController::class, 'createUser'])->middleware('tenant.feature:core.teams');
                Route::patch('users/{user}', [OrganizationController::class, 'updateUser'])->middleware('tenant.feature:core.teams');
                // Permanent hard delete (real DELETE FROM tenant_users, cascades
                // through work orders/PM/comments/attachments/etc). Irreversible.
                // See OrganizationController::deleteUser() for the full picture,
                // including the one deliberate exception (assets.created_by).
                Route::delete('users/{user}', [OrganizationController::class, 'deleteUser'])->middleware('tenant.feature:core.teams');
            });

            Route::post('sites', [OrganizationController::class, 'createSite'])
                ->middleware(['tenant.role:COMPANY_ADMIN', 'tenant.feature:core.assets']);

            Route::middleware('tenant.role:COMPANY_ADMIN,MANAGER,SUPERVISOR')->group(function (): void {
                Route::patch('sites/{site}', [OrganizationController::class, 'updateSite'])->middleware('tenant.feature:core.assets');
                Route::delete('sites/{site}', [OrganizationController::class, 'archiveSite'])->middleware('tenant.feature:core.assets');
                Route::post('locations', [OrganizationController::class, 'createLocation'])->middleware('tenant.feature:core.assets');
                Route::patch('locations/{location}', [OrganizationController::class, 'updateLocation'])->middleware('tenant.feature:core.assets');
                Route::delete('locations/{location}', [OrganizationController::class, 'archiveLocation'])->middleware('tenant.feature:core.assets');
                Route::post('teams', [OrganizationController::class, 'createTeam'])->middleware('tenant.feature:core.teams');
                Route::patch('teams/{team}', [OrganizationController::class, 'updateTeam'])->middleware('tenant.feature:core.teams');
                Route::delete('teams/{team}', [OrganizationController::class, 'archiveTeam'])->middleware('tenant.feature:core.teams');
                Route::post('teams/{team}/members', [OrganizationController::class, 'addTeamMember'])->middleware('tenant.feature:core.teams');
                Route::delete('teams/{team}/members/{tenantUser}', [OrganizationController::class, 'removeTeamMember'])->middleware('tenant.feature:core.teams');
                Route::post('asset-categories', [AssetController::class, 'createCategory'])->middleware('tenant.feature:core.assets');
                Route::patch('asset-categories/{category}', [AssetController::class, 'updateCategory'])->middleware('tenant.feature:core.assets');
                Route::delete('asset-categories/{category}', [AssetController::class, 'archiveCategory'])->middleware('tenant.feature:core.assets');
                Route::post('assets', [AssetController::class, 'store'])->middleware('tenant.feature:core.assets');
                Route::patch('assets/{asset}', [AssetController::class, 'update'])->middleware('tenant.feature:core.assets');
                Route::delete('assets/{asset}', [AssetController::class, 'archive'])->middleware('tenant.feature:core.assets');
                Route::post('assets/{asset}/operators', [AssetController::class, 'assignOperator'])->middleware('tenant.feature:core.assets');
                Route::delete('assets/{asset}/operators/{assignment}', [AssetController::class, 'removeOperator'])->middleware('tenant.feature:core.assets');

                // ---------- Inventory write actions ----------
                Route::post('warehouses', [InventoryController::class, 'storeWarehouse'])->middleware('tenant.feature:core.inventory');
                Route::patch('warehouses/{warehouse}', [InventoryController::class, 'updateWarehouse'])->middleware('tenant.feature:core.inventory');
                Route::delete('warehouses/{warehouse}', [InventoryController::class, 'archiveWarehouse'])->middleware('tenant.feature:core.inventory');
                Route::post('spare-part-categories', [InventoryController::class, 'createCategory'])->middleware('tenant.feature:core.inventory');
                Route::post('spare-parts', [InventoryController::class, 'store'])->middleware('tenant.feature:core.inventory');
                Route::patch('spare-parts/{sparePart}', [InventoryController::class, 'update'])->middleware('tenant.feature:core.inventory');
                Route::delete('spare-parts/{sparePart}', [InventoryController::class, 'archive'])->middleware('tenant.feature:core.inventory');
                Route::post('spare-parts/{sparePart}/stock', [InventoryController::class, 'adjustStock'])->middleware('tenant.feature:core.inventory');
            });

            Route::get('requests', [MaintenanceRequestController::class, 'index'])->middleware('tenant.feature:core.requests');
            Route::post('requests', [MaintenanceRequestController::class, 'store'])->middleware('tenant.feature:core.requests');
            Route::get('requests/{maintenanceRequest}', [MaintenanceRequestController::class, 'show'])->middleware('tenant.feature:core.requests');
            Route::patch('requests/{maintenanceRequest}', [MaintenanceRequestController::class, 'update'])->middleware('tenant.feature:core.requests');
            Route::post('requests/{maintenanceRequest}/cancel', [MaintenanceRequestController::class, 'cancel'])->middleware('tenant.feature:core.requests');
            Route::middleware('tenant.role:MANAGER')->group(function (): void {
                Route::post('requests/{maintenanceRequest}/approve', [MaintenanceRequestController::class, 'approve'])->middleware('tenant.feature:core.requests');
                Route::post('requests/{maintenanceRequest}/reject', [MaintenanceRequestController::class, 'reject'])->middleware('tenant.feature:core.requests');
            });

            Route::get('work-orders', [WorkOrderController::class, 'index'])->middleware('tenant.feature:core.work_orders');
            Route::post('work-orders', [WorkOrderController::class, 'store'])->middleware('tenant.feature:core.work_orders');
            Route::get('work-orders/{workOrder}', [WorkOrderController::class, 'show'])->middleware('tenant.feature:core.work_orders');
            Route::patch('work-orders/{workOrder}', [WorkOrderController::class, 'update'])->middleware('tenant.feature:core.work_orders');
            Route::middleware('tenant.role:COMPANY_ADMIN,MANAGER')->group(function (): void {
                Route::post('work-orders/{workOrder}/approve', [WorkOrderController::class, 'approve'])->middleware('tenant.feature:core.work_orders');
                Route::post('work-orders/{workOrder}/reject', [WorkOrderController::class, 'reject'])->middleware('tenant.feature:core.work_orders');
            });
            foreach (['assign', 'acknowledge', 'start', 'hold', 'resume', 'complete', 'verify', 'reject-completion', 'cancel'] as $action) {
                Route::post("work-orders/{workOrder}/{$action}", [WorkOrderController::class, str_replace('-', '', lcfirst(implode('', array_map('ucfirst', explode('-', $action)))))])->middleware('tenant.feature:core.work_orders');
            }
            Route::post('work-orders/{workOrder}/timer/start', [WorkOrderController::class, 'startTimer'])->middleware('tenant.feature:core.work_orders');
            Route::post('work-orders/{workOrder}/timer/stop', [WorkOrderController::class, 'stopTimer'])->middleware('tenant.feature:core.work_orders');
            Route::post('work-orders/{workOrder}/parts', [WorkOrderController::class, 'usePart'])->middleware('tenant.feature:core.work_orders');
            Route::get('work-orders/{workOrder}/recommendations', [WorkOrderController::class, 'recommendations'])->middleware('tenant.feature:core.work_orders');
            Route::patch('work-orders/{workOrder}/checklist/{item}', [WorkOrderController::class, 'updateChecklist'])->middleware('tenant.feature:core.work_orders');
            Route::post('work-orders/{workOrder}/signature', [WorkOrderController::class, 'sign'])->middleware('tenant.feature:core.work_orders');

            Route::get('attachments/{attachment}/download', [SupportController::class, 'downloadAttachment']);
            Route::middleware('tenant.role:COMPANY_ADMIN,MANAGER,SUPERVISOR,TECHNICIAN,OPERATOR')->group(function (): void {
                Route::post('attachments', [SupportController::class, 'uploadAttachment']);
                Route::delete('attachments/{attachment}', [SupportController::class, 'deleteAttachment']);
                Route::post('comments', [SupportController::class, 'comments']);
            });
            Route::get('notifications', [SupportController::class, 'notifications'])->middleware('tenant.feature:core.notifications');
            Route::post('notifications/read-all', [SupportController::class, 'readAllNotifications'])->middleware('tenant.feature:core.notifications');
            Route::post('notifications/{notification}/read', [SupportController::class, 'readNotification'])->middleware('tenant.feature:core.notifications');
            Route::get('dashboard/summary', [SupportController::class, 'dashboard']);
            Route::get('insights', [SupportController::class, 'insights']);
            Route::get('analytics/reliability', [AnalyticsController::class, 'reliability']);

            // ---------- Manufacturers ----------
            Route::get('manufacturers', [ManufacturerController::class, 'index']);
            Route::get('manufacturers/{manufacturer}', [ManufacturerController::class, 'show']);

            // ---------- Vendors ----------
            Route::get('vendors', [ProcurementController::class, 'vendors']);
            Route::get('vendors/{vendor}', [ProcurementController::class, 'vendor']);

            // ---------- Purchase Orders ----------
            Route::get('purchase-orders', [ProcurementController::class, 'purchaseOrders']);
            Route::get('purchase-orders/{po}', [ProcurementController::class, 'purchaseOrder']);

            Route::middleware('tenant.role:COMPANY_ADMIN,MANAGER,SUPERVISOR')->group(function (): void {
                Route::post('manufacturers', [ManufacturerController::class, 'store']);
                Route::patch('manufacturers/{manufacturer}', [ManufacturerController::class, 'update']);
                Route::delete('manufacturers/{manufacturer}', [ManufacturerController::class, 'archive']);

                Route::post('vendors', [ProcurementController::class, 'storeVendor']);
                Route::patch('vendors/{vendor}', [ProcurementController::class, 'updateVendor']);
                Route::delete('vendors/{vendor}', [ProcurementController::class, 'archiveVendor']);

                Route::post('purchase-orders', [ProcurementController::class, 'storePurchaseOrder']);
                Route::post('purchase-orders/{po}/receive', [ProcurementController::class, 'receivePurchaseOrder']);
                Route::patch('purchase-orders/{po}', [ProcurementController::class, 'updatePurchaseOrder']);
                Route::delete('purchase-orders/{po}', [ProcurementController::class, 'archivePurchaseOrder']);
            });

            Route::get('pm/templates', [PmController::class, 'templates'])->middleware('tenant.feature:core.preventive_maintenance');
            Route::get('pm/templates/{template}', [PmController::class, 'template'])->middleware('tenant.feature:core.preventive_maintenance');
            Route::get('pm/schedules', [PmController::class, 'schedules'])->middleware('tenant.feature:core.preventive_maintenance');
            Route::get('pm/schedules/{schedule}', [PmController::class, 'schedule'])->middleware('tenant.feature:core.preventive_maintenance');
            Route::get('pm/occurrences', [PmController::class, 'occurrences'])->middleware('tenant.feature:core.preventive_maintenance');
            Route::middleware('tenant.role:COMPANY_ADMIN,MANAGER,SUPERVISOR')->group(function (): void {
                Route::post('pm/templates', [PmController::class, 'createTemplate'])->middleware('tenant.feature:core.preventive_maintenance');
                Route::patch('pm/templates/{template}', [PmController::class, 'updateTemplate'])->middleware('tenant.feature:core.preventive_maintenance');
                Route::delete('pm/templates/{template}', [PmController::class, 'archiveTemplate'])->middleware('tenant.feature:core.preventive_maintenance');
                Route::post('pm/schedules', [PmController::class, 'createSchedule'])->middleware('tenant.feature:core.preventive_maintenance');
                Route::patch('pm/schedules/{schedule}', [PmController::class, 'updateSchedule'])->middleware('tenant.feature:core.preventive_maintenance');
                Route::delete('pm/schedules/{schedule}', [PmController::class, 'archiveSchedule'])->middleware('tenant.feature:core.preventive_maintenance');
                Route::post('pm/schedules/{schedule}/pause', [PmController::class, 'pause'])->middleware('tenant.feature:core.preventive_maintenance');
                Route::post('pm/schedules/{schedule}/resume', [PmController::class, 'resume'])->middleware('tenant.feature:core.preventive_maintenance');
            });
        });

        Route::middleware(['tenant.access:false', 'tenant.role:COMPANY_ADMIN'])->prefix('billing')->group(function (): void {
            Route::get('subscription', [BillingController::class, 'subscription']);
            Route::get('plans', [BillingController::class, 'plans']);
            Route::post('subscription/change-plan', [BillingController::class, 'changePlan']);
            Route::get('invoices', [BillingController::class, 'invoices']);
            Route::get('invoices/{invoice}', [BillingController::class, 'invoice']);
            Route::get('payment-channels', [BillingController::class, 'channels']);
            Route::post('invoices/{invoice}/payments', [BillingController::class, 'createPayment']);
            Route::get('payments/{payment}', [BillingController::class, 'payment']);
            Route::post('payments/{payment}/check-status', [BillingController::class, 'checkStatus']);
        });
    });