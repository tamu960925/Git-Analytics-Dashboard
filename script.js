// Chart.js configurations
const chartConfig = {
    type: 'line',
    options: {
        responsive: true,
        plugins: {
            legend: {
                position: 'top',
            }
        },
        scales: {
            y: {
                beginAtZero: true
            }
        }
    }
};

let commitChart, changesChart, contributorsChart, slocChart, commitSizeChart;

function showLoading(show) {
    const button = document.getElementById('analyzeButton');
    const buttonText = button.querySelector('.button-text');
    const spinner = button.querySelector('.loading-spinner');
    const loadingStatus = document.getElementById('loadingStatus');

    button.disabled = show;
    buttonText.textContent = show ? '分析中...' : '分析開始';
    spinner.classList.toggle('hidden', !show);
    loadingStatus.classList.toggle('hidden', !show);
}

// Check URL parameters on load
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const repoUrl = urlParams.get('repo');
    if (repoUrl) {
        document.getElementById('repoUrl').value = repoUrl;
        analyzeRepo();
    }
});

async function analyzeRepo() {
    const repoUrl = document.getElementById('repoUrl').value;
    if (!repoUrl) {
        alert('リポジトリのURLを入力してください');
        return;
    }

    if (!repoUrl.match(/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)/)) {
        alert('GitHubまたはGitLab、BitbucketのURLを入力してください');
        return;
    }

    // Update URL with repository parameter
    const url = new URL(window.location);
    url.searchParams.set('repo', repoUrl);
    window.history.pushState({}, '', url);

    try {
        showLoading(true);
        // Get git log data
        const gitData = await getGitData(repoUrl);
        updateDashboard(gitData);
    } catch (error) {
        alert('エラーが発生しました: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function getGitData(repoPath) {
    try {
        const response = await fetch(`http://localhost:3000/analyze-repo`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ repoPath })
        });

        if (!response.ok) {
            throw new Error('Failed to analyze repository');
        }

        return await response.json();
    } catch (error) {
        console.error('Error analyzing repository:', error);
        throw error;
    }
}

function updateCommitChart(data) {
    const commitDates = Object.keys(data.commitsByDate);
    const commitCounts = Object.values(data.commitsByDate);

    if (commitChart) {
        commitChart.destroy();
    }

    commitChart = new Chart(
        document.getElementById('commitChart'),
        {
            ...chartConfig,
            data: {
                labels: commitDates,
                datasets: [{
                    label: 'コミット数',
                    data: commitCounts,
                    borderColor: '#2563eb',
                    tension: 0.4
                }]
            }
        }
    );
}

function updateChangesChart(data) {
    if (changesChart) {
        changesChart.destroy();
    }

    changesChart = new Chart(
        document.getElementById('changesChart'),
        {
            type: 'bar',
            data: {
                labels: ['追加', '削除'],
                datasets: [{
                    label: '行数',
                    data: [data.totalAdditions, data.totalDeletions],
                    backgroundColor: ['#22c55e', '#ef4444']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        }
    );
}

function updateCommitSizeChart(stats) {
    if (commitSizeChart) {
        commitSizeChart.destroy();
    }

    const distribution = stats.commitSizeDistribution;
    commitSizeChart = new Chart(
        document.getElementById('commitSizeChart'),
        {
            type: 'bar',
            data: {
                labels: distribution.map(d => d.range),
                datasets: [{
                    label: 'コミット数',
                    data: distribution.map(d => d.count),
                    backgroundColor: '#2563eb'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        }
    );
}

function updateLargeCommitsList(largeCommits) {
    const container = document.getElementById('largeCommits');
    container.innerHTML = largeCommits.map(commit => `
        <div class="large-commit-card">
            <div class="commit-hash">${commit.hash}</div>
            <div class="commit-message">${commit.message}</div>
            <div class="commit-stats">
                合計 ${commit.totalChanges} 行の変更
                ${commit.totalChanges >= 500 ? '<span class="warning">（要レビュー）</span>' : ''}
            </div>
        </div>
    `).join('');
}

function updateDashboard(data) {
    // Update charts
    updateCommitChart(data);
    updateChangesChart(data);
    if (data.commitStats) {
        updateCommitSizeChart(data.commitStats);
        // Update commit quality metrics
        document.getElementById('averageChanges').textContent = `${data.commitStats.averageChangesPerCommit}行`;
        document.getElementById('largeCommitRate').textContent = `${data.commitStats.largeCommitPercentage}%`;
        // Update large commits list
        updateLargeCommitsList(data.commitStats.top5LargestCommits);
    }
    
    // Update contributors chart
    if (contributorsChart) {
        contributorsChart.destroy();
    }

    const topContributors = data.contributors.slice(0, 5);
    contributorsChart = new Chart(
        document.getElementById('contributorsChart'),
        {
            type: 'pie',
            data: {
                labels: topContributors.map(c => c.name),
                datasets: [{
                    data: topContributors.map(c => c.commits),
                    backgroundColor: ['#2563eb', '#7c3aed', '#db2777', '#e11d48', '#ea580c']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        }
    );

    // Update SLOC chart
    if (slocChart) {
        slocChart.destroy();
    }

    const slocData = Object.entries(data.sloc);
    slocChart = new Chart(
        document.getElementById('slocChart'),
        {
            type: 'bar',
            data: {
                labels: slocData.map(([ext]) => ext),
                datasets: [{
                    label: '行数',
                    data: slocData.map(([, count]) => count),
                    backgroundColor: '#2563eb'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        }
    );

    // Update statistics
    document.getElementById('totalCommits').textContent = data.totalCommits;
    document.getElementById('activeDays').textContent = data.activeDays;
    document.getElementById('peakHour').textContent = `${data.peakHour}:00`;
    document.getElementById('branchCount').textContent = data.branches.length;
    document.getElementById('topBranch').textContent = data.branches[0]?.name || '-';


    // Update contributors list
    const contributorsContainer = document.getElementById('topContributors');
    contributorsContainer.innerHTML = data.contributors.slice(0, 6).map(c => `
        <div class="contributor-card">
            <div class="contributor-info">
                <div class="contributor-name">${c.name}</div>
                <div class="contributor-stats">
                    コミット: ${c.commits} | 追加: ${c.additions} | 削除: ${c.deletions}
                </div>
                <div class="contributor-email">${c.email}</div>
            </div>
        </div>
    `).join('');
}
