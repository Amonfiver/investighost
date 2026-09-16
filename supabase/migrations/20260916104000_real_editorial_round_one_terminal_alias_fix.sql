-- Evita la colisión entre el alias de la decisión de cobertura y la variable
-- de decisión terminal del traslado a Biblioteca.

do $compat$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.move_approved_result_to_library(text,uuid,uuid,uuid,text,uuid,text,uuid,text,uuid,text,uuid,uuid)'::regprocedure
  ) into definition;
  definition := replace(
    definition,
    'public.real_editorial_coverage_decisions decision',
    'public.real_editorial_coverage_decisions coverage_decision'
  );
  definition := replace(definition, 'decision.id = coverage.latest_decision_id', 'coverage_decision.id = coverage.latest_decision_id');
  definition := replace(definition, 'decision.decision = ''accept_with_warnings''', 'coverage_decision.decision = ''accept_with_warnings''');
  definition := replace(definition, 'decision.risk_accepted', 'coverage_decision.risk_accepted');
  execute definition;
end;
$compat$;
