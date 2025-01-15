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

// Analyze commit sizes and patterns
function analyzeCommitSizes(commitLog) {
    const commits = [];
    let currentCommit = null;
    let totalChanges = 0;
    let largeCommits = 0;
    const LARGE_COMMIT_THRESHOLD = 100;

    commitLog.split('\n').forEach(line => {
        if (line.includes('|')) {
            // Save previous commit if exists
            if (currentCommit) {
                commits.push(currentCommit);
            }
            // Start new commit
            const [hash, timestamp, email, name, message] = line.split('|');
            currentCommit = {
                hash,
                timestamp: parseInt(timestamp),
                email,
                name,
                message,
                additions: 0,
                deletions: 0,
                totalChanges: 0,
                files: []
            };
        } else if (line.trim() && currentCommit) {
            const [additions, deletions, file] = line.split('\t');
            const addCount = parseInt(additions) || 0;
            const delCount = parseInt(deletions) || 0;
            const total = addCount + delCount;

            currentCommit.additions += addCount;
            currentCommit.deletions += delCount;
            currentCommit.totalChanges += total;
            currentCommit.files.push({
                name: file,
                additions: addCount,
                deletions: delCount
            });

            totalChanges += total;
            if (total >= LARGE_COMMIT_THRESHOLD) {
                largeCommits++;
            }
        }
    });

    // Add last commit
    if (currentCommit) {
        commits.push(currentCommit);
    }

    // Calculate statistics
    const totalCommits = commits.length;
    const averageChanges = totalChanges / totalCommits;
    const largeCommitPercentage = (largeCommits / totalCommits) * 100;

    // Sort commits by size to find outliers
    const sortedCommits = [...commits].sort((a, b) => b.totalChanges - a.totalChanges);
    const top5LargestCommits = sortedCommits.slice(0, 5);

    return {
        totalCommits,
        totalChanges,
        averageChangesPerCommit: Math.round(averageChanges),
        largeCommits,
        largeCommitPercentage: Math.round(largeCommitPercentage),
        top5LargestCommits: top5LargestCommits.map(c => ({
            hash: c.hash,
            message: c.message,
            totalChanges: c.totalChanges,
            timestamp: c.timestamp
        })),
        commitSizeDistribution: calculateCommitSizeDistribution(commits)
    };
}

// Calculate commit size distribution
function calculateCommitSizeDistribution(commits) {
    const ranges = [
        { max: 10, count: 0 },
        { max: 50, count: 0 },
        { max: 100, count: 0 },
        { max: 500, count: 0 },
        { max: 1000, count: 0 },
        { max: Infinity, count: 0 }
    ];

    commits.forEach(commit => {
        const size = commit.totalChanges;
        const range = ranges.find(r => size <= r.max);
        if (range) range.count++;
    });

    return ranges.map((range, index) => {
        const min = index === 0 ? 0 : ranges[index - 1].max + 1;
        const max = range.max === Infinity ? 'more' : range.max;
        return {
            range: `${min}-${max}`,
            count: range.count
        };
    });
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

            // Get commit history with detailed stats
            const { stdout: commitLog } = await execAsync('git log --pretty=format:"%h|%at|%ae|%an|%s" --numstat', { cwd: repoDir });
            
            // Get branch information
            const { stdout: branchInfo } = await execAsync('git branch -v --sort=-committerdate', { cwd: repoDir });
            
            // Get file list for SLOC analysis
            const { stdout: fileList } = await execAsync('git ls-files', { cwd: repoDir });

            // Analyze commit sizes
            const commitSizeStats = analyzeCommitSizes(commitLog);
            
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
                sloc: Object.fromEntries(slocByExt),
                commitStats: commitSizeStats
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
