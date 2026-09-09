/* Paste your own two Supabase values here, then save.

   Find them in the Supabase dashboard:
     Project Settings  ->  API Keys

   supabaseUrl   the "Project URL", looks like  https://abcdefgh.supabase.co
                 (Project Settings -> Data API, or the Connect button up top)

   supabaseKey   the "Publishable key", starts with  sb_publishable_
                 On older projects this may instead be called the "anon" or
                 "public" key and start with  ey...  Either one works here.

   Whichever it is called, that key is designed to be public and is safe in a
   public repo. Row level security in the database is what stops one account
   reading another's rows.

   NEVER paste the "secret" key (sb_secret_...) or the old "service_role" key
   into this file. Those bypass all security.                                */

window.KITCHEN_CONFIG = {
  supabaseUrl: 'https://vkhehrrusfxwryjprvwz.supabase.co',
  supabaseKey: 'sb_publishable_mWPIXuO4PZ3kLIkSuuft3A_Vg1-7v0i'
};
