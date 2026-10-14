-- Internal strategy only. Runtime records live here, not in Markdown.
begin;
create table public.growth_experiments (
  experiment_id text primary key default ('IDEA-' || gen_random_uuid()::text),
  title text not null check (length(btrim(title)) between 1 and 200),
  status text not null default 'later' check (status in ('testing','next','later','completed')),
  category text not null default 'Idea',
  hypothesis text not null default '',
  why_it_might_work text not null default '',
  test_when text not null default '',
  primary_success_signal text not null default '',
  supporting_signals text not null default '',
  effort text not null default 'Unspecified' check (effort in ('Unspecified','Low','Medium','High')),
  cash_cost text not null default 'Unspecified' check (cash_cost in ('Unspecified','None/minimal','Low','Medium','Potentially high')),
  notes text not null default '',
  outcome text not null default '',
  learning text not null default '',
  next_step_notes text not null default '',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  -- A single definition snapshot preserves the hypothesis at completion, without event sourcing.
  completed_definition jsonb,
  constraint completed_has_learning check (status <> 'completed' or
    (length(btrim(outcome)) > 0 and length(btrim(learning)) > 0 and completed_at is not null))
);
alter table public.growth_experiments enable row level security;
revoke all on public.growth_experiments from public, anon, authenticated;
grant select, insert, update on public.growth_experiments to authenticated;
create policy growth_read on public.growth_experiments for select to authenticated
  using ((select public.current_internal_admin_role()) = 'superuser');
create policy growth_add on public.growth_experiments for insert to authenticated
  with check ((select public.current_internal_admin_role()) = 'superuser');
create policy growth_edit on public.growth_experiments for update to authenticated
  using ((select public.current_internal_admin_role()) = 'superuser')
  with check ((select public.current_internal_admin_role()) = 'superuser');

create function public.stamp_growth_experiment() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    NEW.experiment_id := OLD.experiment_id;
    NEW.created_at := OLD.created_at;
    NEW.completed_definition := OLD.completed_definition;
    NEW.completed_at := OLD.completed_at;
  else
    NEW.created_at := now();
    NEW.completed_definition := null;
    NEW.completed_at := null;
  end if;
  NEW.updated_at := clock_timestamp();
  if NEW.status = 'completed' and NEW.completed_definition is null then
    NEW.completed_at := now();
    NEW.completed_definition := jsonb_build_object(
      'title', NEW.title, 'hypothesis', NEW.hypothesis,
      'why_it_might_work', NEW.why_it_might_work, 'test_when', NEW.test_when,
      'primary_success_signal', NEW.primary_success_signal,
      'supporting_signals', NEW.supporting_signals, 'category', NEW.category,
      'effort', NEW.effort, 'cash_cost', NEW.cash_cost);
  end if;
  return NEW;
end;
$$;
revoke all on function public.stamp_growth_experiment() from public, anon, authenticated;
create trigger stamp_growth_experiment before insert or update on public.growth_experiments
  for each row execute function public.stamp_growth_experiment();

insert into public.growth_experiments
(experiment_id,title,status,category,hypothesis,why_it_might_work,test_when,primary_success_signal,supporting_signals,notes,sort_order) values
('EXP-001','Restaurant Google Search acquisition','testing','Paid search / acquisition',
 'Independent and smaller multi-site restaurant operators actively searching for customer-feedback solutions will understand FlashFeedback''s proposition, sign up through a predominantly self-service journey and reach real-world activation.',
 'Tests both restaurant demand and whether high-intent search can support FlashFeedback''s desired self-service acquisition model.',
 'Active now.', 'Restaurant businesses acquired through the experiment reaching first eligible genuine feedback.',
 'Measured signup → QR readiness → download/print/order → real opens → eligible genuine feedback.',
 'Current experiment: Google Search → /restaurants/ → signup → QR readiness/deployment signals → real feedback. Campaign: restaurants_search_test_01. Measurement limitations around pre-consent traffic remain documented separately.',1),
('EXP-002','Free Restaurant Feedback QR/Sign Generator','next','Product-led acquisition / free tool',
 'Restaurant operators searching for a customer-feedback QR code or sign will be more likely to adopt FlashFeedback if they receive an immediately useful artefact before being asked to create an account.',
 'Combines acquisition, value demonstration, onboarding, QR creation and deployment; changes the value exchange from signing up for SaaS to receiving the thing they were looking for.',
 'QR-related searches look commercially relevant; ads get clicks but signup conversion is weak; signups occur but QR setup/deployment is weak; or organic search reveals meaningful QR-tool intent.',
 'Businesses acquired through the generator reaching first real customer feedback.',
 'Generator use → account creation → QR readiness/deployment → real feedback.',
 'Concept: Search/content → create free restaurant feedback QR sign → restaurant name/basic config → preview → Want to receive and track responses? Create your free FlashFeedback account → carry config into account/onboarding → QR already ready.',2),
('EXP-003','Restaurant QR Placement Guide','next','SEO / acquisition + activation',
 'Restaurant operators searching for practical QR-placement guidance represent relevant acquisition traffic, while the guidance can simultaneously improve QR deployment among existing users.',
 'One content asset may improve both discovery and activation.',
 'QR placement appears in search terms; businesses prepare QRs but receive few opens; founder follow-up shows placement uncertainty; or organic acquisition becomes a priority.',
 'Qualified acquisition and/or measurable improvement in QR deployment/first-feedback behaviour.',
 'Qualified organic visitors; deployment and first-feedback behaviour among guide readers.',
 'Working title: Where to Put Customer Feedback QR Codes in a Restaurant. Possible placements: tables, bill folders, till/counter, collection points, receipts, takeaway packaging, exit/customer-service moments.',3),
('EXP-004','Powered by FlashFeedback product-led referral loop','later','Product-led acquisition',
 'Some people submitting feedback through FlashFeedback are themselves business owners/decision-makers and may discover the product through the customer journey.',
 'Existing customer scans may become distribution to other restaurants.',
 'Customer-side scan volume becomes meaningful and enough businesses are actively deployed.',
 'New activated businesses attributable to the customer feedback journey.',
 'Owner CTA impressions/clicks → attributable signups → activation.',
 'Existing context: FlashFeedback already has/had an Are you a business owner? CTA at the end of the feedback journey. Inspect production and existing analytics before changing it. Potential loop: Restaurant A → customer scans → owner CTA → customer owns/manages another business → Restaurant B signs up.',4),
('EXP-005','Demo-as-customer acquisition journey','later','Product-led acquisition / conversion',
 'Prospects will understand FlashFeedback faster if they experience the customer journey themselves before being asked to sign up.',
 'Experiencing both sides can make the proposition concrete.',
 'Landing traffic exists but visitors do not convert, or founder conversations show people do not immediately understand the product.',
 'Improved signup and downstream activation among demo users.',
 'Demo completion → signup → genuine downstream activation.',
 'Concept: Experience FlashFeedback as your customer → rate → submit example feedback → immediately show what the restaurant would see → signup CTA. Keep demo feedback separate from genuine customer feedback.',5),
('EXP-006','YouTube and short-form problem-led content','later','Organic content / demand creation',
 'Restaurant operators who are not actively searching for feedback software may engage with recognisable customer-experience problems through video.',
 'Creates demand beyond existing high-intent searches.',
 'High-intent search volume is limited, paid acquisition is unattractive, or demand creation is needed rather than demand capture.',
 'Qualified traffic becoming activated FlashFeedback businesses, not video views.',
 'Qualified visits → signup → activation by content source.',
 'Themes: unhappy customer doesn''t complain; five-second restaurant feedback; catch bad experience before the customer leaves; where to put feedback QR codes; feedback without long surveys; QR feedback vs Google reviews.',6),
('EXP-007','Free Restaurant Feedback Toolkit','later','Lead magnet / product-led activation',
 'A practical restaurant feedback deployment kit may attract relevant operators and reduce effort required to deploy FlashFeedback.',
 'Useful physical materials can reduce deployment effort.',
 'Deployment friction becomes a leading bottleneck.',
 'Toolkit users reaching real QR deployment and feedback.',
 'Kit use/download → physical placement → real opens and feedback.',
 'Potential contents: table sign, counter sign, bill-folder insert, takeaway sticker format, QR placement guide, recommended wording. Prefer connecting to a FlashFeedback account rather than a detached generic PDF where possible.',7),
('EXP-008','Google Reviews vs Private Feedback content','later','SEO / educational acquisition',
 'Restaurant operators researching Google reviews/reputation management may have an adjacent need for private customer feedback.',
 'Adjacent reputation-search demand may reveal relevant operators.',
 'Search Console or Ads search terms reveal relevant review/reputation queries.',
 'Qualified organic visitors becoming activated businesses.',
 'Relevant queries → qualified visitors → activation.',
 'Potential content: Google review QR code vs private feedback QR code / Why Google reviews and private customer feedback do different jobs. Constraint: do not frame as review gating or negative-review suppression.',8),
('EXP-009','Competitor / alternative pages','later','Bottom-of-funnel SEO',
 'Operators comparing existing products may represent high-commercial-intent traffic.',
 'Comparison searches may find buyers already evaluating solutions.',
 'FlashFeedback has enough credibility/customer evidence, Search Console/Ads reveal competitor searches, and restaurant validation is stronger.',
 'Qualified comparison visitors becoming activated businesses.',
 'Commercial-intent search visits → signup → activation.',
 'Examples: FlashFeedback vs ServiceRater / MoniVibe / TasteScore; Tattle alternatives for independent restaurants; restaurant feedback software for independent operators. Comparisons must be fair, current and evidence-based; verify named competitors before publishing.',9),
('EXP-010','Restaurant supplier / agency partnerships','later','Partnership distribution',
 'Businesses already trusted by restaurant operators could distribute FlashFeedback more efficiently than direct paid acquisition.',
 'Trusted suppliers can introduce a validated proposition at relevant moments.',
 'Restaurant activation is proven, paid acquisition looks expensive, and there is enough evidence for partners to recommend it.',
 'Activated businesses per partner/referral source.',
 'Referrals → activated businesses per partner and acquisition effort.',
 'Potential partners: restaurant website agencies, menu designers/printers, hospitality marketing agencies, EPOS consultants, QR/NFC suppliers, independent hospitality consultants.',10),
('EXP-011','Restaurant-owner communities','later','Community/discovery + organic acquisition',
 'Restaurant-owner communities can provide both problem discovery and qualified awareness without high-touch field sales.',
 'Relevant conversations may improve discovery and create qualified awareness.',
 'Useful during early discovery, especially if search demand is limited.',
 'Repeated problem evidence and qualified community visitors becoming activated businesses.',
 'Concrete operator experiences; qualified visits and activation.',
 'Contribute genuinely. Explore how operators learn about bad experiences, whether diners scan table QRs, where they place prompts, and what feedback they act on.',11),
('EXP-012','New vertical landing-page experiments','later','Market/segment expansion',
 'The core private-feedback mechanism may solve similar problems in other in-person businesses.',
 'Restaurant learning may transfer to comparable physical customer moments.',
 'Restaurant learning clarifies which value proposition/product behaviour transfers.',
 'Activation within the new segment, not traffic.',
 'Segment-specific signup → deployment → first genuine feedback.',
 'Potential segments: cafés, pubs, salons, gyms/studios, clinics/dentists, local services. Do not create pages just for SEO.',12),
('EXP-013','POS / app marketplace distribution','later','Platform distribution / integration',
 'Integrations may eventually generate feedback opportunities automatically and expose FlashFeedback to businesses through existing software ecosystems.',
 'Integration value may come from automatically creating feedback opportunities, not just importing metadata.',
 'Restaurant proposition is validated, manual QR deployment limits growth/response volume, a specific platform shows target-market penetration, and integration effort is justified.',
 'Activated businesses and genuine feedback opportunities attributable to the platform.',
 'Target-market adoption × automatic feedback reach × context richness × distribution leverage ÷ implementation/commercial complexity.',
 'Strategic/later. Do not build an integration just because enterprise competitors have one.',13)
on conflict (experiment_id) do nothing;
commit;
