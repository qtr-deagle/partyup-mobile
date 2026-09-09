-- replace with your actual user id or email
-- for deleting ID Verification
delete from public.id_verifications
where user_id = '<Enter User ID>';

update public.profiles
set verification_status = 'unverified'
where id = '<Enter User ID>';

