BEGIN READ ONLY;
SELECT id,email,created_at FROM auth.users
WHERE email = 'otr-meta-qa-20261022-01-a@example.invalid';
ROLLBACK;
