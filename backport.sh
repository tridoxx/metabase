git reset HEAD~1
rm ./backport.sh
git cherry-pick 7b4e4c3349c609054c1b7ce2b75817e543c411a4
echo 'Resolve conflicts and force push this branch'
