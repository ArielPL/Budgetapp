import { describe, it, expect } from 'vitest';
import { licenseNotice, noticeSections, packageOf, reflow } from './licenseNotice';

describe('packageOf', () => {
  it('names the package a bundled module comes from', () => {
    expect(packageOf('/repo/node_modules/react/cjs/react.production.js')).toBe('react');
    expect(packageOf('/repo/node_modules/@capacitor/core/dist/index.js')).toBe('@capacitor/core');
    expect(packageOf('C:\\repo\\node_modules\\fflate\\esm\\browser.js')).toBe('fflate');
  });

  it('takes the innermost package of a nested install', () => {
    expect(packageOf('/repo/node_modules/recharts/node_modules/clsx/dist/clsx.mjs')).toBe('clsx');
  });

  it('leaves out the app’s own code and the bundler’s virtual modules', () => {
    expect(packageOf('/repo/src/App.tsx')).toBeNull();
    expect(packageOf('\0vite/modulepreload-polyfill')).toBeNull();
    expect(packageOf('/repo/node_modules/@scope')).toBeNull();
  });
});

describe('licenseNotice', () => {
  const mit = { name: 'zed', version: '1.0.0', license: 'MIT', text: 'MIT License\n\nCopyright (c) Zed\n' };
  const react = { name: 'react', version: '19.2.6', license: 'MIT', text: 'MIT License\n\nCopyright (c) Meta\n' };

  it('lists every package once, by name, with its own licence text', () => {
    const text = licenseNotice([mit, react, mit], []);
    expect(text.indexOf('react 19.2.6')).toBeLessThan(text.indexOf('zed 1.0.0'));
    expect(text.match(/zed 1\.0\.0/g)).toHaveLength(1);
    expect(text).toContain('Copyright (c) Meta');
    expect(text).toContain('License: MIT');
  });

  it('says what licence applies when a package ships no file', () => {
    const text = licenseNotice([{ name: 'bare', version: '2.0.0', license: 'ISC', text: '' }], []);
    expect(text).toContain('released under ISC');
  });

  it('ends with the native libraries and other texts, in the order given', () => {
    const text = licenseNotice([react], ['NATIVE LIBRARIES\nSQLCipher', 'Apache License']);
    expect(text.indexOf('react 19.2.6')).toBeLessThan(text.indexOf('NATIVE LIBRARIES'));
    expect(text.indexOf('NATIVE LIBRARIES')).toBeLessThan(text.indexOf('Apache License'));
  });
});

describe('reflow and noticeSections', () => {
  it('joins hard-wrapped prose but keeps titles, copyright lines and lists', () => {
    const text = [
      'MIT License',
      '',
      'Copyright (c) Meta Platforms, Inc. and affiliates.',
      'Copyright (c) Someone Else',
      '',
      'Permission is hereby granted, free of charge, to any person obtaining a copy',
      'of this software and associated documentation files (the "Software"), to deal',
      'in the Software without restriction.',
      '    * Redistributions of source code must retain the above copyright',
      '      notice, this list of conditions and the following disclaimer.',
      'Gson                              Copyright Google LLC',
      'Tink                              Copyright Google LLC',
    ].join('\n');
    expect(reflow(text).split('\n')).toEqual([
      'MIT License',
      '',
      'Copyright (c) Meta Platforms, Inc. and affiliates.',
      'Copyright (c) Someone Else',
      '',
      'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction.',
      '    * Redistributions of source code must retain the above copyright',
      '      notice, this list of conditions and the following disclaimer.',
      'Gson                              Copyright Google LLC',
      'Tink                              Copyright Google LLC',
    ]);
  });

  it('splits the notice into one section per library, without the opening', () => {
    const notice = licenseNotice([
      { name: 'a', version: '1', license: 'MIT', text: 'A text' },
      { name: 'b', version: '2', license: 'ISC', text: 'B text' },
    ], ['Native']);
    const sections = noticeSections(notice);
    // The English opening is left out: the app says it in the reader's language.
    expect(sections).toEqual(['a 1\nLicense: MIT\n\nA text', 'b 2\nLicense: ISC\n\nB text', 'Native']);
  });
});
