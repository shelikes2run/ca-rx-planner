#!/bin/sh
# Regenerate exb/config.json; the embed URLs carry the current commit so browsers fetch fresh tool pages.
cd "$(dirname "$0")/.." && node -e "
const {buildExb2}=require('./exb/build_config.js');
const c=buildExb2({wm1:'50c035c0ccaa4de8a3a782f5eb8a2cb2',wm2:'c4d28c3e35fa4d32a41447b24d80c6e2',wm3:'93741188dfda4a92bd43a767fdbfd114',wm4:'bcfb0cd066884ea8ac42804cb8d0e6f5',base:'https://shelikes2run.github.io/ca-rx-planner',ver:process.argv[1]});
require('fs').writeFileSync('exb/config.json',JSON.stringify(c,null,1))" "$(git rev-parse --short HEAD)"
