<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\ApiData;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password as PasswordBroker;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function login(Request $request): mixed
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:320'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:255'],
        ]);
        $user = User::query()->where('email', mb_strtolower($data['email']))->first();
        if (! $user || ! $user->password_hash || ! Hash::check($data['password'], $user->password_hash)) {
            throw new ApiException('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
        }
        if (! in_array($user->status, ['INVITED', 'ACTIVE'], true)) {
            throw new ApiException('USER_INACTIVE', 'This account cannot sign in.', 403);
        }
        if (! $user->email_verified_at && DB::connection(config('tenancy.database.central_connection'))
            ->table('onboarding_registrations')->where('user_id', $user->id)->where('source', 'SELF_SERVICE')->exists()) {
            throw new ApiException('EMAIL_VERIFICATION_REQUIRED', 'Verify your email before signing in.', 403);
        }

        $user->forceFill(['last_login_at' => now()])->save();
        $token = $user->createToken($data['device_name'] ?? 'api-client')->plainTextToken;

        return ApiData::item([
            'token' => $token,
            'token_type' => 'Bearer',
            'must_change_password' => $user->must_change_password,
            'user' => $this->userPayload($user),
        ]);
    }

    public function me(Request $request): mixed
    {
        return ApiData::item([
            'user' => $this->userPayload($request->user()),
            'memberships' => DB::connection(config('tenancy.database.central_connection'))
                ->table('tenant_memberships')
                ->join('tenants', 'tenants.id', '=', 'tenant_memberships.tenant_id')
                ->leftJoin('domains', fn ($join) => $join->on('domains.tenant_id', '=', 'tenants.id')->where('domains.is_primary', true))
                ->where('tenant_memberships.user_id', $request->user()->id)
                ->select('tenant_memberships.id', 'tenant_memberships.role_key', 'tenant_memberships.status', 'tenants.id as tenant_id', 'tenants.name as tenant_name', 'tenants.status as tenant_status', 'domains.domain')
                ->get(),
        ]);
    }

    public function password(Request $request): mixed
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->numbers()],
        ]);
        $user = $request->user();
        if (! Hash::check($data['current_password'], $user->password_hash)) {
            throw new ApiException('CURRENT_PASSWORD_INVALID', 'Current password is incorrect.', 422);
        }
        $user->forceFill([
            'password_hash' => $data['password'],
            'must_change_password' => false,
            'password_changed_at' => now(),
            'status' => 'ACTIVE',
        ])->save();

        return ApiData::item(['password_changed' => true]);
    }

    public function logout(Request $request): mixed
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(null, 204);
    }

    public function forgotPassword(Request $request): mixed
    {
        $data = $request->validate(['email' => ['required', 'email:rfc', 'max:320']]);
        $email = mb_strtolower(trim($data['email']));
        $user = User::query()->where('email', $email)->whereIn('status', ['INVITED', 'ACTIVE'])->first();

        // Always return the same accepted response: this endpoint must not
        // reveal whether an email address belongs to an eligible account.
        if (! $user) {
            return ApiData::item(['message' => 'If an active account exists for this email, a password reset link has been sent.'], 202);
        }

        $status = PasswordBroker::sendResetLink(['email' => $email]);
        if ($status !== PasswordBroker::RESET_LINK_SENT && $status !== PasswordBroker::INVALID_USER) {
            throw new ApiException('PASSWORD_RESET_UNAVAILABLE', 'Password reset is temporarily unavailable. Please try again later.', 503);
        }

        return ApiData::item(['message' => 'If an active account exists for this email, a password reset link has been sent.'], 202);
    }

    public function resetPassword(Request $request): mixed
    {
        $data = $request->validate([
            'token' => ['required', 'string'], 'email' => ['required', 'email:rfc', 'max:320'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->numbers()],
        ]);
        $status = PasswordBroker::reset([
            'email' => mb_strtolower(trim($data['email'])), 'password' => $data['password'],
            'password_confirmation' => $data['password_confirmation'], 'token' => $data['token'],
        ], function (User $user, string $password): void {
            $user->forceFill([
                'password_hash' => $password, 'must_change_password' => false, 'password_changed_at' => now(),
            ])->save();
            $user->tokens()->delete();
        });
        if ($status !== PasswordBroker::PASSWORD_RESET) {
            throw new ApiException('PASSWORD_RESET_INVALID', 'The password reset link is invalid or has expired.', 422);
        }

        return ApiData::item(['password_reset' => true]);
    }

    private function userPayload(User $user): array
    {
        return $user->only(['id', 'email', 'full_name', 'phone', 'status', 'platform_role', 'must_change_password']);
    }
}
