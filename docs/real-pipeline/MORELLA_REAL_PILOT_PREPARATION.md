# Preparación segura del piloto real Morella

Estado: **puerta preparada y cerrada; piloto no ejecutado**.

## Política inmutable

- destino en whitelist: Morella;
- una tarea y concurrencia 1;
- presupuesto inicial 0,20 EUR;
- aviso preventivo desde 0,16 EUR;
- ampliación hasta 0,25 EUR solo con autorización humana explícita;
- límite absoluto 0,50 EUR;
- máximo dos rondas;
- cero regeneraciones y cero publicaciones;
- Tavily como herramienta de investigación y OpenAI como motor de inteligencia.

La feature flag parte desactivada. Solo reconoce el token explícito definido en código para este piloto; valores genéricos como `true` no la habilitan. No existe todavía ninguna acción de ejecución en UI o IPC.

## Preflight obligatorio

Antes de una autorización posterior, el gate debe recibir evidencia pública y saneada de:

1. credenciales cifradas configuradas para Tavily y OpenAI, sin leerlas en renderer;
2. ambos proveedores activos y modelos pertenecientes al catálogo;
3. conexión real autorizada; una prueba simulada no sirve;
4. tarifas versionadas verificadas;
5. presupuesto persistido antes de llamar;
6. saldo suficiente o comprobación humana cuando no sea consultable;
7. Supabase local/objetivo autorizado disponible;
8. ledger durable operativo;
9. guarda global libre;
10. cero tareas reales activas.

Cualquier control no comprobado queda bloqueado. Un saldo no consultable genera aviso; un saldo insuficiente bloquea.

## Estado actual

La pantalla Pipeline real muestra la política y el checklist a partir de estados públicos del Centro de proveedores. Conexiones, tarifas, presupuesto, infraestructura, ledger, guarda y tareas activas permanecen `no comprobadas`; la feature flag sigue apagada. Por tanto, el resultado esperado y correcto es **BLOQUEADO**.

Esta preparación no descifra credenciales, no hace llamadas a Tavily u OpenAI, no consume saldo, no crea tareas, no publica y no conecta Trawel, producción o Automatic.
