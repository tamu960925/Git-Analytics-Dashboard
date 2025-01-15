import express from 'express';
import { exec } from 'child_process';
import cors from 'cors';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { simpleGit } from 'simple-git';
import { rimraf } from 'rimraf';
import fs from 'fs/promises';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, 'temp');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Helper function to get file extension
function getFileExtension(filename) {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

// Helper function to count lines in a file
async function countLines(filePath) {
    try {
        const { stdout } = await execAsync(`wc -l < "${filePath}"`);
        return parseInt(stdout.trim());
    } catch {
        return 0;
    }
}

// Ensure temp directory exists
async function ensureTempDir() {
    try {
        await fs.access(TEMP_DIR);
    } catch {
        await fs.mkdir(TEMP_DIR, { recursive: true });
    }
}

// Clean up temp directory
async function cleanupTempDir(repoDir) {
    try {
        await rimraf(repoDir);
    } catch (error) {
        console.error('Error cleaning up temp directory:', error);
    }
}

app.post('/analyze-repo', async (req, res) => {
    try {
        const { repoPath } = req.body;
        
        if (!repoPath) {
            return res.status(400).json({ error: 'Repository URL is required' });
        }

        await ensureTempDir();

        // Create unique directory for this analysis
        const repoDir = path.join(TEMP_DIR, Date.now().toString());
        await fs.mkdir(repoDir);

        try {
            // Clone repository
            const git = simpleGit();
            await git.clone(repoPath, repoDir);

            // Get commit history
            const { stdout: commitLog } = await execAsync('git log --pretty=format:"%h|%at|%ae|%an" --numstat', { cwd: repoDir });
            
            // Get branch information
            const { stdout: branchInfo } = await execAsync('git branch -v --sort=-committerdate', { cwd: repoDir });
            
            // Get file list for SLOC analysis
            const { stdout: fileList } = await execAsync('git ls-files', { cwd: repoDir });
            
            // Process SLOC by file type
            const files = fileList.split('\n').filter(f => f);
            const slocByExt = new Map();
            
            for (const file of files) {
                const ext = getFileExtension(file);
                if (ext && !['md', 'txt', 'json', 'yaml', 'yml'].includes(ext)) {
                    const lines = await countLines(`${repoDir}/${file}`);
                    slocByExt.set(ext, (slocByExt.get(ext) || 0) + lines);
                }
            }

            // Process branch information
            const branches = branchInfo.split('\n')
                .filter(b => b)
                .map(b => {
                    const match = b.match(/^[* ] (\S+)\s+(\S+)/);
                    return match ? { name: match[1], hash: match[2] } : null;
                })
                .filter(b => b);

            res.json({
                commitLog,
                branches,
                sloc: Object.fromEntries(slocByExt)
            });

        } finally {
            // Cleanup temporary directory
            await cleanupTempDir(repoDir);
        }
    } catch (error) {
        console.error('Error executing git command:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
