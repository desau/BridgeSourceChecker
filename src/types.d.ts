declare module 'title' {
  function title(newTitle: string, options?: { special: string[] }): string
  namespace title { }

  export = title
}