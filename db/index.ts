import { drizzle } from "drizzle-orm/node-postgres";

type Database = ReturnType<typeof createDb>;

/**
 * La conexión la inyecta Netlify Database. El nombre de la variable lo fija su
 * integración, no esta aplicación: es el mismo que lee el adaptador
 * `drizzle-orm/netlify-db`.
 */
const CONNECTION_VARIABLE = "NETLIFY_DB_URL";

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      `${CONNECTION_VARIABLE} no está definida: la base de datos de Netlify no llegó al runtime.`,
    );
    this.name = "MissingDatabaseUrlError";
  }
}

function createDb() {
  const connectionString = process.env[CONNECTION_VARIABLE];
  if (!connectionString) throw new MissingDatabaseUrlError();

  // node-postgres y no `drizzle-orm/netlify-db`, que era lo que había aquí.
  //
  // Aquel adaptador habla con Postgres por HTTP a través del cliente de Neon, y
  // Drizzle 1.0.0-rc.4 lo invoca con la forma `sql(consulta, parámetros)` que
  // el cliente ya no acepta: solo admite tagged templates. El resultado era que
  // *toda* consulta fallaba en producción antes de tocar la red, con
  // "This function can now be called only as a tagged-template function".
  // No es cosa de una versión suelta de Neon —falla igual en 1.0.2 y en
  // 1.1.0—, sino de que el rc de Drizzle quedó descolgado de esa API.
  //
  // El propio adaptador trae la salida: con NETLIFY_DB_DRIVER=server delega en
  // node-postgres. Se llama aquí directamente en lugar de fijar esa variable
  // porque el resultado es idéntico —esa rama no aplica ningún codec propio— y
  // así la decisión vive en el repositorio y no en un ajuste del panel que
  // nadie recuerda haber puesto.
  //
  // `max: 1` porque cada instancia de Lambda atiende una petición a la vez:
  // un pool mayor solo abriría conexiones ociosas contra Postgres, que era la
  // razón por la que se había elegido el driver HTTP.
  return drizzle({
    connection: { connectionString, max: 1, idleTimeoutMillis: 10_000 },
  });
}

let cached: Database | null = null;

export function getDb(): Database {
  // Las instancias de Lambda se reutilizan entre invocaciones: construir el
  // cliente una vez por instancia ahorra el trabajo en cada request caliente y
  // deja que el pool reaproveche la conexión ya abierta.
  if (!cached) cached = createDb();
  return cached;
}
