git reset HEAD~1
rm ./backport.sh
git cherry-pick 60919cce5c9a0266122f020f81e9dc81b5a2e60f
echo 'Resolve conflicts and force push this branch'
