-- replace with your actual user id or email
-- for deleting ID Verification
delete from public.id_verifications
where user_id = '<Enter User ID>';

update public.profiles
set verification_status = 'unverified'
where id = '<Enter User ID>';

----------------------------------------------------------

-- encrypted password
select email, encrypted_password from auth.users;

----------------------------------------------------------

Related commands:
• npm run demo:locations refreshes the map positions. Run it right before presenting, since people disappear from Nearby after 5 minutes.

• npm run demo:reset removes all demo data and doesn't create any.

----------------------------------------------------------
