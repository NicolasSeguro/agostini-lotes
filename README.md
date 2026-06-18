# ERP Agostini - Frontend

Aplicación web del ERP Grupo ADI.

## Setup inicial (primera vez)

1. Abrir PowerShell en esta carpeta
2. Instalar dependencias:
   ```
   npm install
   ```
   (Tarda 2-5 minutos la primera vez)
3. Editar `.env.local` y cambiar:
   - `DB_PASSWORD` por tu contraseña de PostgreSQL
   - `ADMIN_PASSWORD` por una contraseña de admin segura
   - `JWT_SECRET` por cualquier string largo (32+ caracteres)

## Arrancar el servidor

```
npm run dev
```

Abrir http://localhost:3000 en el navegador.

Login: usuario `admin` con la contraseña que definiste.

## Pantallas disponibles

- **Dashboard**: conteos y saldos consolidados por fideicomiso
- **Personas**: listado con búsqueda
- **Detalle persona**: ventas y cuotas del cliente

## Cambiar de fideicomiso

En la barra lateral hay un selector arriba con los 4 fideicomisos.

## Parar el servidor

Ctrl+C en la terminal.

## Próximas pantallas (siguientes turnos)

- Lotes con filtros por proyecto y estado
- Detalle de lote
- Ventas con búsqueda
- Reportes
- Cobranzas
