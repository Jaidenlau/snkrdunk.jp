-- =============================================================================
-- Pilot seed — Postpartum early recovery: confinement & rest practices
-- SOURCE-VERIFIED PASS (2026-07-31)
-- =============================================================================
-- Every published claim below was checked against a real, named authoritative
-- source, with the supporting excerpt and check date recorded (claim_sources.
-- excerpt / checked_on). `human_confirmed` is FALSE on all of them: a person has
-- not yet opened each live page and signed off — and several of these sources
-- (ACOG, CDC, NHS, PMC) block automated retrieval, so human confirmation is the
-- real final step. Until then they are published-but-flagged.
--
-- One claim (AU postnatal depression screening) was NOT verified this pass and
-- is left as `draft` — so it does NOT appear as verified content. That is the
-- workflow working: unverified stays hidden.
--
-- Run order: 0001_schema.sql, 0002_provenance.sql, then this file.
-- =============================================================================
begin;

-- --- Sources (all real, named, dated where available) -----------------------
insert into sources (id, title, publisher, url, source_type, markets, published_date, retrieved_date, credibility_tier, notes) values
('a0000000-0000-0000-0000-000000000001', '3 Conditions to Watch for After Childbirth', 'ACOG (American College of Obstetricians and Gynecologists)', 'https://www.acog.org/womens-health/experts-and-stories/the-latest/3-conditions-to-watch-for-after-childbirth', 'professional_org', '{US}', null, '2026-07-31', 1, 'Authoritative US body. NOTE: acog.org blocks automated fetch (HTTP 403) — content confirmed via search retrieval; needs human confirmation on the live page.'),
('a0000000-0000-0000-0000-000000000002', 'Urgent Maternal Warning Signs and Symptoms (HEAR HER Campaign)', 'CDC', 'https://www.cdc.gov/hearher/maternal-warning-signs/index.html', 'public_health_body', '{US}', null, '2026-07-31', 1, 'US public-health body. Lists heavy vaginal bleeding after pregnancy as an urgent warning sign.'),
('a0000000-0000-0000-0000-000000000003', 'Your 6-week postnatal check', 'NHS', 'https://www.nhs.uk/baby/support-and-services/your-6-week-postnatal-check/', 'public_health_body', '{EU}', null, '2026-07-31', 1, 'UK NHS guidance on the 6–8 week postnatal check.'),
('a0000000-0000-0000-0000-000000000004', 'Your body after the birth', 'NHS', 'https://www.nhs.uk/pregnancy/labour-and-birth/your-body/', 'public_health_body', '{EU}', null, '2026-07-31', 1, 'UK NHS guidance on physical recovery after birth.'),
('a0000000-0000-0000-0000-000000000005', 'Heterogeneity of "Zuo Yuezi" practices among Chinese postpartum women and its association with postpartum depression', 'PMC (peer-reviewed)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12989433/', 'peer_reviewed', '{CN}', null, '2026-07-31', 2, 'Peer-reviewed documentation of zuo yuezi prevalence and duration.'),
('a0000000-0000-0000-0000-000000000006', 'Experiences of postpartum Chinese women undergoing confinement practices: a qualitative meta-synthesis', 'PMC (peer-reviewed)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11608940/', 'peer_reviewed', '{CN}', null, '2026-07-31', 2, 'Peer-reviewed meta-synthesis describing confinement dietary/behavioural/hygiene precautions.');

-- --- Journey stages (postpartum_early per market) ---------------------------
insert into journey_stages (id, life_stage, market, title, overview, physical, emotional) values
('b0000000-0000-0000-0000-000000000001', 'postpartum_early', 'US', 'Early Recovery (0-6 weeks) — US', 'US guidance emphasises recognising urgent warning signs in the early weeks.', 'Watch for warning signs such as very heavy bleeding.', 'Mood changes are monitored.'),
('b0000000-0000-0000-0000-000000000002', 'postpartum_early', 'EU', 'Early Recovery (0-6 weeks) — EU/NHS', 'NHS frames recovery as gradual and individual, with a formal check at 6–8 weeks.', 'Lochia (bleeding) usually stops after 6–8 weeks; recovery varies.', 'Mental wellbeing discussed at the postnatal check.'),
('b0000000-0000-0000-0000-000000000003', 'postpartum_early', 'CN', 'Early Recovery (0-6 weeks) — CN (Confinement)', 'Shaped by zuo yuezi: a widely-practised ~1-month structured confinement.', 'Extended rest; dietary and bathing restrictions are common.', 'Family support central during confinement.'),
('b0000000-0000-0000-0000-000000000004', 'postpartum_early', 'AU', 'Early Recovery (0-6 weeks) — AU', 'Australian guidance (verification pending).', null, null);

-- --- Claims -----------------------------------------------------------------
-- PUBLISHED (source-verified pass, human_confirmed = false)
insert into claims (id, statement, life_stage, market, topic_domain, evidence_level, confidence_note, status, reviewer, review_date, human_confirmed) values
('c0000000-0000-0000-0000-000000000001',
 'Very heavy postpartum bleeding — for example soaking through two sanitary pads an hour for more than an hour or two, or passing large clots — is an urgent warning sign requiring immediate medical care.',
 'postpartum_early', 'US', 'medical_clinical', 'strong_evidence',
 'CORRECTED during verification: an earlier draft said "one pad per hour" — ACOG''s stated emergency threshold is two pads an hour for more than an hour or two. Consistent with CDC HEAR HER. Human confirmation on the live ACOG page still pending (site blocks automated fetch).',
 'published', 'Autoploy (source pass)', '2026-07-31', false),

('c0000000-0000-0000-0000-000000000002',
 'The NHS postnatal check is offered 6–8 weeks after birth to check recovery and wellbeing; vaginal bleeding (lochia) usually stops after 6–8 weeks, and recovery is gradual and varies between individuals.',
 'postpartum_early', 'EU', 'physical', 'strong_evidence',
 'NHS public-health guidance. Frames recovery as individual and gradual with a formal 6–8 week check — a different care model from CN structured confinement (see claim c...0003).',
 'published', 'Autoploy (source pass)', '2026-07-31', false),

('c0000000-0000-0000-0000-000000000003',
 'In China, postpartum confinement (zuo yuezi) is widely practised for about a month: studies report roughly 95% of women observe it for 30 days or more, resting at home with dietary restrictions such as avoiding "cold" foods.',
 'postpartum_early', 'CN', 'social_support', 'traditional_practice',
 'The PREVALENCE and duration are peer-reviewed and well-documented; the health rationale of confinement is traditional practice, not clinically established. Contrasts with the NHS gradual-recovery model (claim c...0002) — a care-culture difference, shown side by side, not flattened.',
 'published', 'Autoploy (source pass)', '2026-07-31', false),

('c0000000-0000-0000-0000-000000000004',
 'Zuo yuezi confinement customs commonly include hygiene precautions such as restricting bathing and hair-washing during the confinement month.',
 'postpartum_early', 'CN', 'physical', 'traditional_practice',
 'Documented as custom in peer-reviewed meta-synthesis. Clinical evidence does not support the cold/bathing-avoidance rationale, and the same review flags some confinement practices as potentially harmful. Labelled traditional practice, not endorsed.',
 'published', 'Autoploy (source pass)', '2026-07-31', false);

-- DRAFT (NOT verified this pass → deliberately hidden from the dashboard/chatbot)
insert into claims (id, statement, life_stage, market, topic_domain, evidence_level, confidence_note, status, human_confirmed) values
('c0000000-0000-0000-0000-000000000009',
 'Routine screening for postnatal depression during the early postpartum period is recommended in Australia.',
 'postpartum_early', 'AU', 'emotional_mental', null,
 'NOT YET VERIFIED. Left as draft pending a check against RANZCOG / COPE guidance. Intentionally not published — demonstrates that unverified content stays hidden.',
 'draft', false);

-- --- Claim <-> Source links, WITH recorded provenance (excerpt + checked_on) -
insert into claim_sources (claim_id, source_id, relation, excerpt, checked_on) values
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'supports',
 'Seek emergency help right away if you experience heavy bleeding (bleeding that soaks through two sanitary pads an hour for more than an hour or two).', '2026-07-31'),
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'supports',
 'Heavy vaginal bleeding or leaking fluid after pregnancy is identified as one of the urgent maternal warning signs.', '2026-07-31'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'supports',
 'You should have your postnatal check 6 to 8 weeks after your baby''s birth to make sure you feel well and are recovering properly.', '2026-07-31'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'supports',
 'You''ll have bleeding (lochia) from your vagina for a few weeks after you give birth. The bleeding usually stops after 6 to 8 weeks, but it can last longer.', '2026-07-31'),
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'supports',
 'Approximately 95% of women practiced "Zuo Yuezi" for >=30 days, and nearly half strictly followed a 30-day "Zuo Yuezi" period.', '2026-07-31'),
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'contradicts',
 'NHS frames recovery as gradual and individual with a formal 6–8 week check — contrasts with a structured 30-day confinement model.', '2026-07-31'),
('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000006', 'supports',
 'Zuo yuezi included ... hygiene precautions, such as restricting bathing and dental hygiene ...', '2026-07-31');

-- --- Stage <-> Claim links (published claims only) --------------------------
insert into stage_claims (journey_stage_id, claim_id) values
('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002'),
('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003'),
('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000004');

-- --- Needs -------------------------------------------------------------------
insert into needs (id, life_stage, market, need_description, existing_solutions, gap_analysis) values
('d0000000-0000-0000-0000-000000000001', 'postpartum_early', 'CN', 'Structured confinement support (meals, care, guidance) during zuo yuezi.', 'Confinement centers (yue zi zhong xin), live-in confinement nannies (yue sao), meal delivery services.', 'Highly variable quality; little integration of evidence-based clinical safety with the tradition.'),
('d0000000-0000-0000-0000-000000000002', 'postpartum_early', 'US', 'Clear, sourced guidance on early-weeks warning signs alongside recovery products.', 'Postpartum recovery kits, pads, peri bottles, lactation support products.', 'Warning-sign guidance is fragmented across brands and marketing; little that is genuinely evidence-rated.');

insert into stage_needs (journey_stage_id, need_id) values
('b0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002');

-- --- Competitors -------------------------------------------------------------
insert into competitors (id, company, markets, categories, positioning, communication_notes, claims_made, evidence_check) values
('e0000000-0000-0000-0000-000000000001', 'Example Confinement Center (CN)', '{CN}', '{confinement_care,postpartum_meals,nanny_service}', 'Premium zuo yuezi confinement care.', 'Tradition-forward; family reassurance; premium wellness tone.', 'Faster recovery and better lactation via traditional confinement.', 'Recovery/lactation claims are marketing framing over a traditional-practice base; not clinically established. (Illustrative profile — competitor research not yet source-verified.)'),
('e0000000-0000-0000-0000-000000000002', 'Example Postpartum Recovery Brand (US)', '{US}', '{recovery_products,lactation}', 'Modern, clinical-feeling postpartum recovery kit.', 'Clean/clinical branding; empowerment tone.', 'Clinically informed recovery essentials.', 'Products are reasonable; "clinically informed" is positioning, not an evidence rating. (Illustrative profile — competitor research not yet source-verified.)');

insert into need_solutions (need_id, competitor_id) values
('d0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002');

commit;
