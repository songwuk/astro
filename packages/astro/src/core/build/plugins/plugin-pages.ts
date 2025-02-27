import type { Plugin as VitePlugin } from 'vite';
import { pagesVirtualModuleId, resolvedPagesVirtualModuleId } from '../../app/index.js';
import { MIDDLEWARE_PATH_SEGMENT_NAME } from '../../constants.js';
import { addRollupInput } from '../add-rollup-input.js';
import { eachPageData, hasPrerenderedPages, type BuildInternals } from '../internal.js';
import type { AstroBuildPlugin } from '../plugin';
import type { StaticBuildOptions } from '../types';

export function vitePluginPages(opts: StaticBuildOptions, internals: BuildInternals): VitePlugin {
	return {
		name: '@astro/plugin-build-pages',

		options(options) {
			if (opts.settings.config.output === 'static' || hasPrerenderedPages(internals)) {
				return addRollupInput(options, [pagesVirtualModuleId]);
			}
		},

		resolveId(id) {
			if (id === pagesVirtualModuleId) {
				return resolvedPagesVirtualModuleId;
			}
		},

		async load(id) {
			if (id === resolvedPagesVirtualModuleId) {
				let middlewareId = null;
				if (opts.settings.config.experimental.middleware) {
					middlewareId = await this.resolve(
						`${opts.settings.config.srcDir.pathname}/${MIDDLEWARE_PATH_SEGMENT_NAME}`
					);
				}

				let importMap = '';
				let imports = [];
				let i = 0;
				for (const pageData of eachPageData(internals)) {
					const variable = `_page${i}`;
					imports.push(`import * as ${variable} from ${JSON.stringify(pageData.moduleSpecifier)};`);
					importMap += `[${JSON.stringify(pageData.component)}, ${variable}],`;
					i++;
				}

				i = 0;
				let rendererItems = '';
				for (const renderer of opts.settings.renderers) {
					const variable = `_renderer${i}`;
					// Use unshift so that renderers are imported before user code, in case they set globals
					// that user code depends on.
					imports.unshift(`import ${variable} from '${renderer.serverEntrypoint}';`);
					rendererItems += `Object.assign(${JSON.stringify(renderer)}, { ssr: ${variable} }),`;
					i++;
				}

				const def = `${imports.join('\n')}

${middlewareId ? `import * as _middleware from "${middlewareId.id}";` : ''}

export const pageMap = new Map([${importMap}]);
export const renderers = [${rendererItems}];
${middlewareId ? `export const middleware = _middleware;` : ''}
`;

				return def;
			}
		},
	};
}

export function pluginPages(opts: StaticBuildOptions, internals: BuildInternals): AstroBuildPlugin {
	return {
		build: 'ssr',
		hooks: {
			'build:before': () => {
				return {
					vitePlugin: vitePluginPages(opts, internals),
				};
			},
		},
	};
}
