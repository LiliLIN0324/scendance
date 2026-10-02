let catalogue;

// Both viewports and the source dialog share one request and JSON parse.
export function loadCatalogue() {
  return catalogue ??= fetch(new URL('./assets/catalogue.json', import.meta.url))
    .then(async response => {
      if (!response.ok) throw new Error(`素材清单 HTTP ${response.status}`);
      const value = await response.json();
      if (!Array.isArray(value.assets) || !value.assets.length) throw new Error('素材清单为空');
      return value;
    })
    .catch(error => { catalogue = undefined; throw error; });
}
