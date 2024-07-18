git reset HEAD~1
rm ./backport.sh
git cherry-pick 7ea19b4f723af6e42d08b77da7b2b0231f614c8f
echo 'Resolve conflicts and force push this branch'
