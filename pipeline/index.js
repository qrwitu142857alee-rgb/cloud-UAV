export function createPipeline(plugins = []) {
  return {
    async run(ctx) {
      for (const p of plugins) {
        await p(ctx);
        if (ctx.stop) break;
      }
      return ctx;
    }
  };
}
