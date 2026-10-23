// File system check script
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicPath = path.join(__dirname, 'public');

console.log('Checking directory structure...');
console.log(`Current directory: ${__dirname}`);
console.log(`Public directory: ${publicPath}`);

// Check if public directory exists
if (fs.existsSync(publicPath)) {
    console.log('✓ Public directory exists');
    
    // List files in public directory
    const files = fs.readdirSync(publicPath);
    console.log('\nFiles in public directory:');
    files.forEach(file => {
        const filePath = path.join(publicPath, file);
        const stats = fs.statSync(filePath);
        console.log(`- ${file} (${stats.isDirectory() ? 'directory' : 'file'}, ${stats.size} bytes)`);
    });
    
    // Check if index.html exists
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        console.log('\n✓ index.html exists');
        const stats = fs.statSync(indexPath);
        console.log(`  Size: ${stats.size} bytes`);
        console.log(`  Created: ${stats.birthtime}`);
        console.log(`  Modified: ${stats.mtime}`);
        
        try {
            // Display first few lines of index.html
            const content = fs.readFileSync(indexPath, 'utf8');
            const lines = content.split('\n').slice(0, 5);
            console.log('\nFirst few lines of index.html:');
            lines.forEach((line, i) => {
                console.log(`  ${i+1}: ${line}`);
            });
        } catch (err) {
            console.log('\n✗ Error reading index.html:', err.message);
        }
    } else {
        console.log('\n✗ index.html does not exist');
        
        // Create index.html if it doesn't exist
        console.log('\nCreating index.html...');
        try {
            fs.writeFileSync(indexPath, '<!DOCTYPE html>\n<html>\n<head>\n<title>Redirect</title>\n<meta http-equiv="refresh" content="0; url=home.html">\n</head>\n<body>\n<p>Redirecting to <a href="home.html">home.html</a>...</p>\n</body>\n</html>');
            console.log('✓ index.html created successfully');
        } catch (err) {
            console.log('✗ Error creating index.html:', err.message);
        }
    }
    
    // Check if home.html exists
    const homePath = path.join(publicPath, 'home.html');
    if (fs.existsSync(homePath)) {
        console.log('\n✓ home.html exists');
        const stats = fs.statSync(homePath);
        console.log(`  Size: ${stats.size} bytes`);
    } else {
        console.log('\n✗ home.html does not exist');
    }
} else {
    console.log('✗ Public directory does not exist');
} 