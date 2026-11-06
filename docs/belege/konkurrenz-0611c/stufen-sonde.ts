import { embedQuery, ollamaBaseUrl, DEFAULT_EMBED_MODEL } from "/Users/damiantodorovic/kepta-app/src/core/embeddings";
(async () => {
  const v = await embedQuery("Sonde");
  console.log(`UMGEBUNG=${process.env.KEPTA_EMBED_MODEL ?? "(leer)"}  MARKE=${DEFAULT_EMBED_MODEL}  ADRESSE=${ollamaBaseUrl()}  VEKTOR=${v ? v.length + " Dimensionen" : "KEINE ANTWORT"}`);
})();
