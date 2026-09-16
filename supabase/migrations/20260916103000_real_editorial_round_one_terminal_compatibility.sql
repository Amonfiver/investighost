-- Compatibilidad terminal para la aceptación explícita de cobertura en ronda 1.
--
-- La aceptación 20260916094500 autoriza redactar sin una segunda búsqueda Tavily.
-- Estas dos transacciones todavía exigían R2, aunque el checkpoint y la decisión
-- durable de R1 son coherentes. No modifica artefactos, costes ni decisiones;
-- solo admite R1 si la aceptación con warnings existe de forma durable.

do $compat$
declare
  definition text;
  accepted_round_one text := $round$
(
  current_round = 2
  or (
    current_round = 1
    and exists (
      select 1
      from public.real_editorial_coverage_reviews coverage
      join public.real_editorial_coverage_decisions decision
        on decision.id = coverage.latest_decision_id
      where coverage.pilot_id = p_pilot_id
        and coverage.run_id = p_run_id
        and coverage.status = 'accepted'
        and decision.decision = 'accept_with_warnings'
        and decision.risk_accepted
    )
  )
)$round$;
begin
  select pg_get_functiondef(
    'public.resolve_real_editorial_terminal_review(text,uuid,uuid,uuid,text,uuid,text,uuid,text,uuid,text,uuid,text,text,text,jsonb,jsonb,boolean)'::regprocedure
  ) into definition;
  definition := replace(
    definition,
    'and state = ''pending_human_review'' and current_round = 2',
    'and state = ''pending_human_review'' and ' || accepted_round_one
  );
  definition := replace(
    definition,
    'or snapshot.payload->>''currentRound'' <> ''2''',
    'or snapshot.payload->>''currentRound'' not in (''1'',''2'')'
  );
  execute definition;

  select pg_get_functiondef(
    'public.move_approved_result_to_library(text,uuid,uuid,uuid,text,uuid,text,uuid,text,uuid,text,uuid,uuid)'::regprocedure
  ) into definition;
  definition := replace(
    definition,
    'or run.current_round <> 2 then',
    'or not ' || replace(accepted_round_one, 'current_round', 'run.current_round') || ' then'
  );
  definition := replace(
    definition,
    'or snapshot.payload->>''currentRound'' <> ''2''',
    'or snapshot.payload->>''currentRound'' not in (''1'',''2'')'
  );
  definition := replace(
    definition,
    'if latest_round->>''round'' <> ''2''',
    'if latest_round->>''round'' not in (''1'',''2'')'
  );
  execute definition;
end;
$compat$;
