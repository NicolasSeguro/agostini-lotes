-- Usuarios de demo para la matriz de roles (staging). No usar en produccion.
-- laura = gerencia (autoriza). vendedor no puede autorizar.

INSERT INTO shared.usuarios (username, password_hash, nombre, rol, activo)
VALUES
  ('laura', '$2a$10$lDPrCfWW/lT3KgviesMYyOvVtLJa.NatiplSQeHJA/bmbI146zEPu', 'Laura Agostini', 'ADMIN', true),
  ('vendedor', '$2a$10$ikPmhAWhYT0yaSwDmmO5UOVEsbK8ImpDuY9CVU.cNPjGaTqRIJPGq', 'Emanuel Vendedor', 'VENDEDOR', true),
  ('caja', '$2a$10$x4kGtSL9t6.Av/nlWqVTruZsiKlH5gDZjdAUNiBOu3mCtJcYgWfLe', 'Caja Agostini', 'CAJERO', true),
  ('conta', '$2a$10$DQDoe8RJktYEYQT0zPbD3utyRzjLT250GXR9JMrtvTGVHmgMbbJF6', 'Contabilidad ADI', 'ADMIN_B', true)
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  nombre = EXCLUDED.nombre,
  rol = EXCLUDED.rol,
  activo = true;
