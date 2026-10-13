// Native stand-in for react-dom/server: there is no HTML to render on native.
export const renderToString = (_element: unknown) => '';
export const renderToStaticMarkup = renderToString;
export default { renderToString, renderToStaticMarkup };
