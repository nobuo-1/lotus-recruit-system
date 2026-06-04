alter table if exists public.form_outreach_senders
  add column if not exists sender_type text not null default 'corporate'
    check (sender_type in ('corporate', 'individual')),
  add column if not exists sender_company_kana text,
  add column if not exists sender_department text,
  add column if not exists sender_position text,
  add column if not exists sender_name_kana text,
  add column if not exists sender_last_name_kana text,
  add column if not exists sender_first_name_kana text;

notify pgrst, 'reload schema';
