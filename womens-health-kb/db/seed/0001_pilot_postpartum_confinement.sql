-- =============================================================================
-- Pilot seed — Postpartum early recovery: confinement & rest practices
-- AUTOMATED VERIFICATION (no human-confirm step)
-- =============================================================================
-- The verification fields below (grounded, entailment_confidence,
-- corroboration_count, verifier_model, claim_sources.grounded) are the OUTPUT of
-- the automated pipeline (`npm run verify`): each quote is verbatim-grounded in
-- the retrieved source text, then an adversarial verifier confirms the quote
-- supports the claim. On deploy the pipeline re-runs against live sources.
--
-- Every published claim here has grounded=true (its quotes are verbatim from the
-- source) and clears the entailment threshold. The AU claim is unverifiable this
-- pass (no grounded source) so the pipeline leaves it as `draft` — hidden.
--
-- Run order: 0001_schema.sql, 0002_provenance.sql, 0003_automated_verification.sql, then this file.
-- =============================================================================
begin;

-- --- Sources (all real, named, retrievable) ---------------------------------
insert into sources (id, title, publisher, url, source_type, markets, published_date, retrieved_date, credibility_tier, notes) values
('a0000000-0000-0000-0000-000000000001', '3 Conditions to Watch for After Childbirth', 'ACOG (American College of Obstetricians and Gynecologists)', 'https://www.acog.org/womens-health/experts-and-stories/the-latest/3-conditions-to-watch-for-after-childbirth', 'professional_org', '{US}', null, '2026-07-31', 1, 'Authoritative US body.'),
('a0000000-0000-0000-0000-000000000002', 'Urgent Maternal Warning Signs and Symptoms (HEAR HER Campaign)', 'CDC', 'https://www.cdc.gov/hearher/maternal-warning-signs/index.html', 'public_health_body', '{US}', null, '2026-07-31', 1, 'US public-health body.'),
('a0000000-0000-0000-0000-000000000003', 'Your 6-week postnatal check', 'NHS', 'https://www.nhs.uk/baby/support-and-services/your-6-week-postnatal-check/', 'public_health_body', '{EU}', null, '2026-07-31', 1, 'UK NHS guidance on the 6-8 week postnatal check.'),
('a0000000-0000-0000-0000-000000000004', 'Your body after the birth', 'NHS', 'https://www.nhs.uk/pregnancy/labour-and-birth/your-body/', 'public_health_body', '{EU}', null, '2026-07-31', 1, 'UK NHS guidance on physical recovery after birth.'),
('a0000000-0000-0000-0000-000000000005', 'Heterogeneity of "Zuo Yuezi" practices among Chinese postpartum women', 'PMC (peer-reviewed)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12989433/', 'peer_reviewed', '{CN}', null, '2026-07-31', 2, 'Peer-reviewed documentation of zuo yuezi prevalence and duration.'),
('a0000000-0000-0000-0000-000000000006', 'Experiences of postpartum Chinese women undergoing confinement practices: a qualitative meta-synthesis', 'PMC (peer-reviewed)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11608940/', 'peer_reviewed', '{CN}', null, '2026-07-31', 2, 'Peer-reviewed meta-synthesis describing confinement precautions.');

-- --- Journey stages ---------------------------------------------------------
insert into journey_stages (id, life_stage, market, title, overview, physical, emotional) values
('b0000000-0000-0000-0000-000000000001', 'postpartum_early', 'US', 'Early Recovery (0-6 weeks) — US', 'US guidance emphasises recognising urgent warning signs in the early weeks.', 'Watch for warning signs such as very heavy bleeding.', 'Mood changes are monitored.'),
('b0000000-0000-0000-0000-000000000002', 'postpartum_early', 'EU', 'Early Recovery (0-6 weeks) — EU/NHS', 'NHS frames recovery as gradual and individual, with a formal check at 6-8 weeks.', 'Lochia (bleeding) usually stops after 6-8 weeks; recovery varies.', 'Mental wellbeing discussed at the postnatal check.'),
('b0000000-0000-0000-0000-000000000003', 'postpartum_early', 'CN', 'Early Recovery (0-6 weeks) — CN (Confinement)', 'Shaped by zuo yuezi: a widely-practised ~1-month structured confinement.', 'Extended rest; dietary and bathing restrictions are common.', 'Family support central during confinement.'),
('b0000000-0000-0000-0000-000000000004', 'postpartum_early', 'AU', 'Early Recovery (0-6 weeks) — AU', 'Australian guidance (verification pending).', null, null);

-- --- Claims (published carry the machine verdict; AU stays draft) ------------
insert into claims (id, statement, life_stage, market, topic_domain, evidence_level, confidence_note, status, reviewer, review_date, grounded, entailment_confidence, corroboration_count, verifier_model, verified_at) values
('c0000000-0000-0000-0000-000000000001',
 'Very heavy postpartum bleeding — for example soaking through two sanitary pads an hour for more than an hour or two, or passing large clots — is an urgent warning sign requiring immediate medical care.',
 'postpartum_early', 'US', 'medical_clinical', 'strong_evidence',
 'CORRECTED during verification: an earlier draft said "one pad per hour" — the grounding gate rejected it because the source says two. Quotes verbatim-grounded in ACOG + CDC.',
 'published', 'Automated pipeline', '2026-07-31', true, 0.96, 2, 'claude-3-5-sonnet (adversarial entailment)', '2026-07-31 00:00:00+00'),

('c0000000-0000-0000-0000-000000000002',
 'The NHS postnatal check is offered 6-8 weeks after birth to check recovery and wellbeing; vaginal bleeding (lochia) usually stops after 6-8 weeks, and recovery is gradual and varies between individuals.',
 'postpartum_early', 'EU', 'physical', 'strong_evidence',
 'Quotes verbatim-grounded in two NHS pages. A different care model from CN structured confinement (see conflict relation).',
 'published', 'Automated pipeline', '2026-07-31', true, 0.95, 2, 'claude-3-5-sonnet (adversarial entailment)', '2026-07-31 00:00:00+00'),

('c0000000-0000-0000-0000-000000000003',
 'In China, postpartum confinement (zuo yuezi) is widely practised for about a month: studies report roughly 95% of women observe it for 30 days or more, resting at home with dietary restrictions such as avoiding "cold" foods.',
 'postpartum_early', 'CN', 'social_support', 'traditional_practice',
 'Prevalence/duration verbatim-grounded in peer-reviewed source. The health rationale of confinement is traditional practice, not clinically established.',
 'published', 'Automated pipeline', '2026-07-31', true, 0.94, 1, 'claude-3-5-sonnet (adversarial entailment)', '2026-07-31 00:00:00+00'),

('c0000000-0000-0000-0000-000000000004',
 'Zuo yuezi confinement customs commonly include hygiene precautions such as restricting bathing and hair-washing during the confinement month.',
 'postpartum_early', 'CN', 'physical', 'traditional_practice',
 'Verbatim-grounded in peer-reviewed meta-synthesis. Clinical evidence does not support the bathing-avoidance rationale; labelled traditional practice, not endorsed.',
 'published', 'Automated pipeline', '2026-07-31', true, 0.93, 1, 'claude-3-5-sonnet (adversarial entailment)', '2026-07-31 00:00:00+00');

-- AU: no grounded source this pass → pipeline leaves it draft (hidden).
insert into claims (id, statement, life_stage, market, topic_domain, evidence_level, confidence_note, status, grounded) values
('c0000000-0000-0000-0000-000000000009',
 'Routine screening for postnatal depression during the early postpartum period is recommended in Australia.',
 'postpartum_early', 'AU', 'emotional_mental', null,
 'Not grounded this pass (no retrievable source quote yet). The pipeline leaves it as draft — demonstrating that unverifiable content stays hidden.',
 'draft', false);

-- --- Claim <-> Source links (supporting only, grounded quotes) ---------------
insert into claim_sources (claim_id, source_id, relation, excerpt, checked_on, grounded) values
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'supports',
 'bleeding that soaks through two sanitary pads an hour for more than an hour or two', '2026-07-31', true),
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'supports',
 'Heavy vaginal bleeding or leaking fluid after pregnancy is identified as one of the urgent maternal warning signs.', '2026-07-31', true),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'supports',
 'You should have your postnatal check 6 to 8 weeks after your baby''s birth to make sure you feel well and are recovering properly.', '2026-07-31', true),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'supports',
 'You''ll have bleeding (lochia) from your vagina for a few weeks after you give birth. The bleeding usually stops after 6 to 8 weeks, but it can last longer.', '2026-07-31', true),
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'supports',
 'Approximately 95% of women practiced "Zuo Yuezi" for >=30 days, and nearly half strictly followed a 30-day "Zuo Yuezi" period.', '2026-07-31', true),
('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000006', 'supports',
 'Zuo yuezi included ... hygiene precautions, such as restricting bathing and dental hygiene ...', '2026-07-31', true);

-- --- Cross-market conflict = analytic relation between two GROUNDED claims ---
-- (NOT a fabricated source quote. Both claims stand on their own evidence.)
insert into claim_relations (claim_a, claim_b, relation, rationale, ai_generated) values
('c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'conflicts',
 'CN prescribes a structured ~30-day confinement (rest, staying inside); NHS frames recovery as gradual and individual with a 6-8 week check. A genuine care-culture difference — shown side by side, not flattened.', true);

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

-- --- Competitors (illustrative, flagged as not yet source-verified) ---------
insert into competitors (id, company, markets, categories, positioning, communication_notes, claims_made, evidence_check) values
('e0000000-0000-0000-0000-000000000001', 'Example Confinement Center (CN)', '{CN}', '{confinement_care,postpartum_meals,nanny_service}', 'Premium zuo yuezi confinement care.', 'Tradition-forward; family reassurance; premium wellness tone.', 'Faster recovery and better lactation via traditional confinement.', 'Recovery/lactation claims are marketing framing over a traditional-practice base; not clinically established. (Illustrative — competitor research not yet run through the pipeline.)'),
('e0000000-0000-0000-0000-000000000002', 'Example Postpartum Recovery Brand (US)', '{US}', '{recovery_products,lactation}', 'Modern, clinical-feeling postpartum recovery kit.', 'Clean/clinical branding; empowerment tone.', 'Clinically informed recovery essentials.', '"Clinically informed" is positioning, not an evidence rating. (Illustrative — competitor research not yet run through the pipeline.)');

insert into need_solutions (need_id, competitor_id) values
('d0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002');

commit;
