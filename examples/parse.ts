/* eslint-disable no-console -- This executable example prints parser output. */
import { createParser } from '@elysionjs/blive-ws/parser';

const parser = createParser({ roomId: 21452505, observeShapes: true });

parser.on('event', event => console.log('event', event));
parser.on('unknownCommand', result => console.log('unknownCommand', result.command));
parser.on('schemaMismatch', result => console.log('schemaMismatch', result.issues));
parser.on('schemaChange', diagnostic => console.log('schemaChange', diagnostic.changes));

parser.parse({ cmd: 'LIKE_INFO_V3_UPDATE', data: { click_count: 123 } });
parser.parse({ cmd: 'FUTURE_COMMAND', data: { count: 1 } });
parser.parse({ cmd: 'FUTURE_COMMAND', data: { count: '1' } });
parser.parse({ cmd: 'LIKE_INFO_V3_UPDATE', data: { click_count: 'unexpected' } });

console.log('status', parser.getStatus());
