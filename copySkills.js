const fs = require('fs');
try {
    fs.symlinkSync('/Users/hmy/.gemini/skills', './.agent/skills');
    console.log('Symlink created successfully.');
} catch (e) {
    console.error('Failed to create symlink:', e.message);
}
