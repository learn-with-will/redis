// Prism core + the languages the Redis lessons use. CLI request/response
// transcripts, key diagrams, and `redis.conf` snippets use the `text` fence,
// which Prism leaves unhighlighted. `bash` covers shell + redis-cli invocations
// and Docker; `json` covers RedisJSON, config, and RESP payloads; `lua` covers
// the scripting lesson (EVAL / Redis Functions); `yaml` covers docker-compose
// and CI-style config.
import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-lua';
import 'prismjs/components/prism-yaml';
import 'prismjs/themes/prism-tomorrow.css';

export default Prism;
