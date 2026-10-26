#!/usr/bin/env perl
# mass-perl.pl — apply geode rename.pairs via perl -pi across a git repo's
# tracked files (no symlinks; --dry-run prints the diff you WOULD make).
#
# Usage:
#   perl mass-perl.pl --repo /path --pairs f1,pairs f2,pairs [--dry-run] [--commit "msg"]
#
# Pairs rules (one per line):  substr: O=>N | word: O=>N | prefix: O=>N | exclude: T
# substr/word/prefix auto-expand OLD/UPPER/Capitalized variants.
# Exclusions are placeholder-armored so no rule can touch them.
use strict; use warnings; use File::Find;
use Getopt::Long;
use Cwd qw(abs_path);

my ($repo,$pairs_str,$dry,$commit);
GetOptions('repo=s'=>\$repo,'pairs=s'=>\$pairs_str,'dry-run'=>\$dry,'commit=s'=>\$commit) or die "bad args\n";
die "need --repo" unless $repo;
$repo = abs_path($repo);
die "not a git repo: $repo" unless -d "$repo/.git";
my @pairfiles = split /,/, $pairs_str;

# ---- build rules ----
my (@rules, @excludes);
sub build_rule {
  my ($mode,$o,$n)=@_;
  for my $v ([$o,$n],[uc($o),uc($n)],[ucfirst($o),ucfirst($n)]) {
    my ($oo,$nn)=@$v; next if !$oo || $oo eq $nn;
    my $qo = quotemeta $oo;
    my $re = $mode eq 'substr' ? $qo
           : $mode eq 'word'   ? "\\b$qo\\b"
           :                     "\\b$qo";
    push @rules, [$re,$nn];
  }
}
for my $pf (@pairfiles) {
  open my $fh, '<', $pf or die "open $pf: $!";
  while (<$fh>) { chomp; s/^\s+|\s+$//g; next if !$_ || /^#/;
    if (/^(substr|word|prefix)\s*:\s*(.+)$/) { my ($m,$rest)=($1,$2); my ($o,$n)=split /\s*=>\s*/, $rest; build_rule($m,$o,$n); }
    elsif (/^exclude\s*:\s*(.+)$/) { my $e=$1; $e =~ s/^\s+|\s+$//g; push @excludes, $e if length $e; }
    else { die "bad line in $pf: $_"; }
  }
  close $fh;
}
my @pat = map { [quotemeta($_),0] } @excludes;  # token, count
# armor function
sub apply_rules {
  my ($t)=@_;
  my %map; my $i=0;
  for my $e (@excludes) { next unless defined $e && length $e; if (index($t,$e)>=0){ my $ph="\0X$i\0"; $t =~ s/\Q$e\E/$ph/g; $map{$ph}=$e; $i++; } }
  for my $r (@rules) { my ($re,$nn)=@$r; $t =~ s/$re/$nn/g; }
  $t =~ s/\0X(\d+)\0/$map{"\0X$1\0"}/ge;
  return $t;
}

# ---- enumerate tracked files ----
my @files;
open my $lf,'-|','git',"-C",$repo,"ls-files","-z" or die "git ls-files: $!";
local $/ = "\0"; @files = <$lf>; close $lf;
my @skip = (qr{/node_modules/},qr{/\.git/},qr{/target/},qr{/dist/},qr{/build/},qr{/\.venv/},qr{/venv/},qr{/__pycache__/},qr{/\.cache/});
# Historical/snapshot/backup/reference surfaces are NOT live refs — never
# rewrite them (they record the old name by design). Also never rewrite the
# pairs files (the mapping itself must keep OLD=>NEW) or binary/runtime state.
my @skip_rel = (
  qr{(^|/)archive/}, qr{(^|/)backups/}, qr{/\.bak\.?}, qr{~HEAD}, qr{\.snapshot},
  qr{-rename\.pairs$}, qr{/rename\.pairs$}, qr{(\b|\.)rename\.pairs$},
  qr{runtime\.json$}, qr{verdicts\.jsonl$}, qr{/\.state/}, qr{/logs?/},
  qr{/graphs?/}, qr{/\.git/}, qr{\.swp$}, qr{\.tmp$},
);
my $count=0; my $changed=0;
for my $f (@files) {
  chomp $f; next unless length $f;
  my $full = "$repo/$f";
  next if -l $full;
  my $rel = $f;
  next if grep { $rel =~ $_ } @skip;
  next if grep { $rel =~ $_ } @skip_rel;
  # binary heuristic
  open my $rf,'<',$full or next; my $buf=''; my $sz=sysread($rf,$buf,8192); close $rf;
  next if defined $sz && $sz>0 && $buf =~ /^\x00/ && $buf !~ /^[\x09\x0a\x0d\x20-\x7e]*$/;
  open my $fh,'<',$full or next;
  local $/; my $orig=<$fh>; close $fh;
  my $new=apply_rules($orig);
  next if $new eq $orig;
  $changed++;
  if ($dry) {
    print "== $rel ==\n";
    # show line-level old -> new so a sweep can be reviewed, not just named
    my @ol = split /\n/, $orig;
    my @nl = split /\n/, $new;
    my $max = @ol > @nl ? @ol : @nl;
    for my $i (0..$max-1) {
      my ($a,$b)=($ol[$i]//'', $nl[$i]//'');
      if (defined $ol[$i] && defined $nl[$i] && $a ne $b) { print "  -$a\n  +$b\n"; }
    }
  }
  else { open my $wh,'>',$full or die "write $full: $!"; print $wh $new; close $wh; }
}
print "mass-perl: repo=$repo rules=".scalar(@rules)." excludes=".scalar(@excludes)." changed=$changed files (".($dry?"DRY-RUN":"WRITE").")\n";

# ---- filename pass: apply the same rules to tracked paths, git mv deepest-first ----
open my $lf2,'-|','git',"-C",$repo,"ls-files","-z" or die "git ls-files: $!";
local $/ = "\0"; my @files2 = <$lf2>; close $lf2;
my @renames; my @collisions;
for my $f (@files2) {
  chomp $f; next unless length $f;
  next if grep { $f =~ $_ } @skip;
  next if grep { $f =~ $_ } @skip_rel;
  my $nn = apply_rules($f);
  next if $nn eq $f;
  if (-e "$repo/$nn") { push @collisions, "$f -> $nn (target exists)"; next; }
  push @renames, [$f,$nn];
}
@renames = sort { length($b->[0]) <=> length($a->[0]) } @renames;  # deepest first
my $renamed=0;
for my $r (@renames) {
  my ($o,$n)=@$r;
  next if $dry;
  my $dir=$n; $dir =~ s{/[^/]+$}{};
  if ($dir && !-d "$repo/$dir") { system("mkdir","-p","$repo/$dir")==0 or next; }
  if (system("git","-C",$repo,"mv","--",$o,$n)==0) { $renamed++; }
  else { push @collisions, "$o -> $n (git mv failed)"; }
}
print "mass-perl: ".($dry?"would rename":"renamed")." ".($dry?scalar(@renames):$renamed)." paths\n";
for my $r (@renames) { print "  R $r->[0] -> $r->[1]\n"; }
for my $c (@collisions) { print "  ! COLLISION $c\n"; }

if (!$dry && $commit) { system("git","-C",$repo,"add","-A")==0 or die "add"; system("git","-C",$repo,"commit","-m",$commit)==0 or die "commit: $!"; print "committed: $commit\n"; }
exit(scalar(@collisions) ? 2 : 0);
