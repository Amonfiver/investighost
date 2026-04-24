# ARCHITECTURE.md — Investighost

## 1. Propósito
Este documento define la arquitectura inicial de Investighost, el agente personal de investigación diseñado para recopilar, estructurar y preparar contenido útil que luego podrá revisarse y publicarse en Trawel.

La arquitectura está pensada para:
- evitar prompts genéricos,
- apoyarse en investigación real,
- producir salidas estructuradas y editoriales,
- mantener contexto y trazabilidad,
- y facilitar una futura integración con Trawel.

---

## 2. Principios de arquitectura

### 2.1. Investigación antes que redacción
Investighost no debe generar contenido directamente a partir de una petición vacía.  
Primero debe investigar, recopilar señales y estructurar información.  
Después debe redactar.

### 2.2. Separación entre datos y texto
La salida del sistema debe estar dividida en:
- una capa estructurada reutilizable,
- una capa editorial orientada a publicación.

Esto evita depender solo de texto libre y permite reutilizar la información en Trawel.

### 2.3. Revisión humana obligatoria
La publicación no será automática en la primera fase.  
Todo contenido generado por Investighost debe pasar por revisión manual del usuario.

### 2.4. Persistencia de contexto
Investighost debe conservar memoria operativa:
- resultados de investigación,
- estados de revisión,
- borradores generados,
- y documentación viva del proyecto.

### 2.5. Escalabilidad por módulos
La arquitectura debe ser modular para permitir crecer poco a poco sin rehacer el sistema completo.

---

## 3. Visión general del flujo

### Flujo principal
1. El usuario indica un destino.
2. Investighost interpreta la petición.
3. El sistema investiga fuentes y recopila señales.
4. El sistema transforma lo investigado en datos estructurados.
5. El sistema genera un borrador editorial.
6. El usuario revisa el resultado.
7. El usuario aprueba y publica en Trawel.
8. El sistema registra la operación en persistencia y bitácora.

---

## 4. Módulos principales

## 4.1. Input Interpreter
### Función
Interpretar la petición inicial del usuario y convertirla en un input claro y normalizado para el sistema.

### Responsabilidades
- recibir país, ciudad, zona o barrio,
- detectar parámetros opcionales,
- validar que la petición tenga suficiente contexto,
- construir una petición estructurada interna.

### Ejemplo de entrada humana
- "Italia > Roma > Trastevere"
- "Japón > Tokio > viaje de 3 días"
- "México > CDMX > viaje en pareja"

### Decisión de integración futura
- La arquitectura de Investighost asume que Trawel será rehecho por el propio equipo.

- Por ello, la integración futura entre Investighost y Trawel podrá diseñarse de forma nativa, mediante un puente de publicación limpio y controlado, sin depender de limitaciones heredadas de versiones anteriores.

- Esta decisión permite que Investighost prepare desde el inicio:
- datos estructurados reutilizables,
- borradores editoriales revisables,
- y un flujo claro de publicación compatible con la futura arquitectura de Trawel.

### Ejemplo de salida interna
```json
{
  "country": "Italia",
  "city": "Roma",
  "zone": "Trastevere",
  "traveler_profile": null,
  "trip_duration_days": null,
  "research_mode": "general"
}