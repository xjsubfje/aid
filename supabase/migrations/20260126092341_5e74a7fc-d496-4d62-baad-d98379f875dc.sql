-- Remove email column from profiles table to prevent PII exposure
-- Emails are already securely stored in auth.users table

-- Drop the existing handle_new_user function first (it references the email column)
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Remove the email column from profiles table
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;

-- Recreate the handle_new_user function without email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  
  INSERT INTO public.settings (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger for handle_new_user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Also add explicit auth check to the SELECT policy for defense-in-depth
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() IS NOT NULL AND auth.uid() = id);