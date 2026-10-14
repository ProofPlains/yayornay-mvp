-- Run via Supabase execute_sql. All fixtures and mutations are rolled back.
begin;
do $$
declare
  admin_id uuid;
  idea public.growth_experiments%rowtype;
  changed integer;
  snapshot jsonb;
begin
  select user_id into admin_id from public.internal_admins where role = 'superuser' limit 1;
  if admin_id is null then raise exception 'An existing superuser is needed for this check'; end if;
  if (select count(*) from public.growth_experiments where experiment_id ~ '^EXP-0(0[1-9]|1[0-3])$') <> 13 then raise exception 'Seed identities missing/duplicated'; end if;

  execute 'set local role anon';
  begin
    perform count(*) from public.growth_experiments;
    raise exception 'Anonymous strategy read succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.growth_experiments(title) values ('Must not persist');
    raise exception 'Anonymous strategy write succeeded';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text, true);
  execute 'set local role authenticated';
  if public.current_internal_admin_role() is not null then raise exception 'Ordinary user unexpectedly admin'; end if;
  if (select count(*) from public.growth_experiments) <> 0 then raise exception 'Ordinary user read strategy'; end if;
  begin
    insert into public.growth_experiments(title) values ('Must not persist');
    raise exception 'Ordinary user wrote strategy';
  exception when insufficient_privilege then null; end;
  update public.growth_experiments set notes = 'Must not persist' where experiment_id='EXP-001';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Ordinary user updated strategy'; end if;
  if has_table_privilege(current_user,'public.growth_experiments','DELETE') then raise exception 'Delete grant exposed'; end if;
  execute 'reset role';

  -- An authenticated request without a user identity also sees no records.
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  execute 'set local role authenticated';
  if (select count(*) from public.growth_experiments) <> 0 then raise exception 'Identity-less request read strategy'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', jsonb_build_object('sub',admin_id,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.growth_experiments) < 13 then raise exception 'Authorised read failed'; end if;
  insert into public.growth_experiments(title,notes,hypothesis) values ('Validation only','Rolled back','Original hypothesis') returning * into idea;
  if idea.status <> 'later' or idea.category <> 'Idea' or idea.experiment_id not like 'IDEA-%' then raise exception 'Quick-capture defaults failed'; end if;
  update public.growth_experiments set title='Edited idea',status='next' where experiment_id=idea.experiment_id;
  if not exists(select 1 from public.growth_experiments where experiment_id=idea.experiment_id and title='Edited idea' and status='next') then raise exception 'Edit/Next failed'; end if;
  update public.growth_experiments set status='testing' where experiment_id=idea.experiment_id;
  if not exists(select 1 from public.growth_experiments where experiment_id=idea.experiment_id and status='testing') then raise exception 'Start failed'; end if;
  update public.growth_experiments set status='later' where experiment_id=idea.experiment_id;
  if not exists(select 1 from public.growth_experiments where experiment_id=idea.experiment_id and status='later') then raise exception 'Pause failed'; end if;
  begin
    update public.growth_experiments set status='completed' where experiment_id=idea.experiment_id;
    raise exception 'Completion without learning succeeded';
  exception when check_violation then null; end;
  update public.growth_experiments set status='completed',outcome='Observed result',learning='Recorded learning',next_step_notes='Review backlog' where experiment_id=idea.experiment_id;
  select completed_definition into snapshot from public.growth_experiments where experiment_id=idea.experiment_id;
  if snapshot->>'hypothesis' <> 'Original hypothesis' then raise exception 'Original hypothesis lost'; end if;
  update public.growth_experiments set hypothesis='Later edit',completed_definition='{}',completed_at=null,experiment_id='Changed ID',created_at=now()-interval '1 day',archived_at=now() where experiment_id=idea.experiment_id;
  if not exists(select 1 from public.growth_experiments where experiment_id=idea.experiment_id and created_at=idea.created_at and completed_at is not null and archived_at is not null and completed_definition=snapshot and learning='Recorded learning') then raise exception 'Archive/identity/snapshot retention failed'; end if;
  update public.growth_experiments set archived_at=null where experiment_id=idea.experiment_id;
  if not exists(select 1 from public.growth_experiments where experiment_id=idea.experiment_id and archived_at is null and status='completed') then raise exception 'Restore failed'; end if;
  begin
    delete from public.growth_experiments where experiment_id=idea.experiment_id;
    raise exception 'Authorised permanent delete succeeded';
  exception when insufficient_privilege then null; end;
  insert into public.growth_experiments(experiment_id,title) values('EXP-001','Must not replace original') on conflict(experiment_id) do nothing;
  if not exists(select 1 from public.growth_experiments where experiment_id='EXP-001' and title='Restaurant Google Search acquisition') then raise exception 'Reseeding overwrote experiment'; end if;
  perform public.acquisition_cohort_report(current_date-1,current_date);
  execute 'reset role';
end;
$$;
rollback;
