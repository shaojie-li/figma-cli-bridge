// Keep the page identity across transport retries, including a failure to switch pages.
export async function openDesignPage(figma, {request, digest}) {
  const {args, id} = request;
  const pages = figma.root.children;
  let page;
  let created = false;
  if (args.pageId) {
    page = pages.find(candidate => candidate.id === args.pageId);
  } else {
    const key = 'design-page-' + id;
    const record = JSON.parse(figma.root.getPluginData(key) || 'null');
    if (record) {
      if (record.digest !== digest) throw Error('建页请求与原记录不同');
      if (!record.pageId) throw Error('上次建页在记录页面 ID 前中断，请回读页面列表核对');
      page = pages.find(candidate => candidate.id === record.pageId);
    } else {
      if (pages.some(candidate => candidate.name === args.name)) throw Error('页面已同名，请核对 ID 或另取名称');
      figma.root.setPluginData(key, JSON.stringify({digest}));
      try {
        page = figma.createPage();
      } catch (error) {
        figma.root.setPluginData(key, '');
        throw error;
      }
      figma.root.setPluginData(key, JSON.stringify({digest, pageId: page.id}));
      page.name = args.name;
      created = true;
    }
  }
  if (!page) throw Error('指定的页面已不存在，请重新核对目标');
  if (figma.currentPage.id !== page.id) await figma.setCurrentPageAsync(page);
  return {result: {pageId: page.id, name: page.name, created}};
}
