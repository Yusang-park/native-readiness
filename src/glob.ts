const toRegExp = (glob: string) => {
  let pattern = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index] ?? '';
    if (char === '*' && glob[index + 1] === '*') {
      pattern += '.*';
      index += 1;
      if (glob[index + 1] === '/') index += 1;
    } else if (char === '*') {
      pattern += '[^/]*';
    } else {
      pattern += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${pattern}$`);
};

export const matchesGlob = (file: string, glob: string) => toRegExp(glob).test(file);

export const matchesAnyGlob = (file: string, globs: string[]) => globs.some((glob) => matchesGlob(file, glob));
