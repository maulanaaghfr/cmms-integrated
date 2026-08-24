<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class CreatePlatformAdmin extends Command
{
    protected $signature = 'cmms:admin:create
        {email : Super Admin email address}
        {--name= : Full name}
        {--password= : Password; omit to enter it securely}';

    protected $description = 'Create or promote a central user as an active CMMS Super Admin';

    public function handle(): int
    {
        $email = Str::lower(trim((string) $this->argument('email')));
        $name = trim((string) ($this->option('name') ?: 'AITOMA Super Admin'));
        $password = (string) ($this->option('password') ?: $this->secret('Password'));
        $validator = Validator::make(compact('email', 'name', 'password'), [
            'email' => ['required', 'email:rfc', 'max:320'],
            'name' => ['required', 'string', 'max:255'],
            'password' => ['required', Password::min(8)->letters()->numbers()],
        ]);
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->components->error($error);
            }

            return self::FAILURE;
        }

        $user = User::withTrashed()->firstOrNew(['email' => $email]);
        $user->fill([
            'full_name' => $name, 'password_hash' => Hash::make($password), 'status' => 'ACTIVE',
            'platform_role' => 'SUPER_ADMIN', 'must_change_password' => false,
        ]);
        $user->email_verified_at ??= now();
        $user->password_changed_at = now();
        $user->deleted_at = null;
        $user->save();

        $this->components->info("Super Admin {$email} is ready.");

        return self::SUCCESS;
    }
}
