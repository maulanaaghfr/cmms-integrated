<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_password_reset_changes_the_password_and_invalidates_the_token(): void
    {
        $user = User::factory()->create(['status' => 'ACTIVE', 'password_hash' => Hash::make('OldPassword123')]);
        $token = Password::createToken($user);

        $this->postJson('http://localhost/api/v1/auth/reset-password', [
            'email' => $user->email,
            'token' => $token,
            'password' => 'NewPassword123',
            'password_confirmation' => 'NewPassword123',
        ])->assertOk()->assertJsonPath('data.password_reset', true);

        $this->assertTrue(Hash::check('NewPassword123', $user->fresh()->password_hash));
        $this->postJson('http://localhost/api/v1/auth/reset-password', [
            'email' => $user->email, 'token' => $token,
            'password' => 'AnotherPassword123', 'password_confirmation' => 'AnotherPassword123',
        ])->assertStatus(422);
    }

    public function test_reset_token_expiry_is_enforced(): void
    {
        $user = User::factory()->create(['status' => 'ACTIVE']);
        $token = Password::createToken($user);
        config()->set('auth.passwords.users.expire', 0);

        $this->postJson('http://localhost/api/v1/auth/reset-password', [
            'email' => $user->email, 'token' => $token,
            'password' => 'NewPassword123', 'password_confirmation' => 'NewPassword123',
        ])->assertStatus(422);
    }

    public function test_ineligible_accounts_do_not_receive_a_reset_token(): void
    {
        $user = User::factory()->create(['status' => 'SUSPENDED']);

        $this->postJson('http://localhost/api/v1/auth/forgot-password', ['email' => $user->email])
            ->assertStatus(202);

        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
    }
}
