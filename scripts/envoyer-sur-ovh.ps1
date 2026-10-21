# Envoie le site Mini-jeux sur l'hébergement OVH par FTP.
# Dans le dossier décompressé : clic droit > « Ouvrir dans le terminal », puis :
#   powershell -ExecutionPolicy Bypass -File .\envoyer-sur-ovh.ps1
# Le mot de passe FTP est demandé ici et ne quitte pas ce PC (sauf vers OVH).
param(
    [string]$Serveur = 'ftp.cluster129.hosting.ovh.net',
    [string]$Identifiant = '',
    [string]$Dossier = 'www'
)

$ErrorActionPreference = 'Stop'
# Dossier « site » du ZIP prêt à envoyer, sinon dossier www du dépôt.
$site = Join-Path $PSScriptRoot 'site'
if (-not (Test-Path $site)) { $site = Join-Path $PSScriptRoot '..\www' }
if (-not (Test-Path $site)) { throw "Dossier 'site' introuvable à côté du script." }
if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { throw "curl.exe introuvable : il faut Windows 10 ou plus récent." }

Write-Host ""
Write-Host "Envoi de Mini-jeux vers $Serveur (dossier $Dossier)" -ForegroundColor Yellow
Write-Host "Identifiant et mot de passe : espace client OVH > Hébergements > onglet FTP - SSH"
Write-Host ""
if (-not $Identifiant) { $Identifiant = Read-Host "Identifiant FTP" }
$secret = Read-Host "Mot de passe FTP" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$motDePasse = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

# Les identifiants passent par un fichier temporaire plutôt que par la ligne de commande.
$config = [IO.Path]::GetTempFileName()
$utilisateur = ($Identifiant + ':' + $motDePasse).Replace('\', '\\').Replace('"', '\"')
[IO.File]::WriteAllText($config, "user = `"$utilisateur`"`n", (New-Object Text.UTF8Encoding $false))

$base = (Resolve-Path $site).Path
$fichiers = @(Get-ChildItem -Path $site -Recurse -File -Force)

function Envoyer($fichier, $options) {
    $relatif = $fichier.FullName.Substring($base.Length).TrimStart('\', '/').Replace('\', '/')
    $url = "ftp://$Serveur/$Dossier/$relatif"
    & curl.exe -sS --ftp-create-dirs --connect-timeout 20 -K $config @options -T $fichier.FullName $url
    return $LASTEXITCODE
}

try {
    # Connexion chiffrée si le serveur l'accepte, sinon FTP classique.
    $options = @('--ssl', '--ssl-no-revoke')
    $code = Envoyer $fichiers[0] $options
    if ($code -ne 0) {
        $options = @()
        $code = Envoyer $fichiers[0] $options
    }
    if ($code -ne 0) {
        throw "Connexion impossible (code $code) : vérifie l'identifiant et le mot de passe FTP."
    }
    Write-Host "  ok  $($fichiers[0].Name)"

    $erreurs = 0
    foreach ($f in $fichiers[1..($fichiers.Count - 1)]) {
        if ((Envoyer $f $options) -eq 0) {
            Write-Host "  ok  $($f.FullName.Substring($base.Length + 1))"
        } else {
            Write-Host "  ÉCHEC  $($f.FullName.Substring($base.Length + 1))" -ForegroundColor Red
            $erreurs++
        }
    }

    Write-Host ""
    if ($erreurs -eq 0) {
        Write-Host "Terminé : $($fichiers.Count) fichiers envoyés. Ouvre https://jellyker.fr" -ForegroundColor Green
    } else {
        Write-Host "$erreurs fichier(s) en échec : relance le script." -ForegroundColor Red
    }
} finally {
    Remove-Item $config -Force -ErrorAction SilentlyContinue
}
