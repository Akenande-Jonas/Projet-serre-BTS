<?php
class Utilisateur {

    private $pdo;

    public function __construct($pdo){
        $this->pdo = $pdo;
    }

    public function getAll(){
        return $this->pdo->query("SELECT * FROM LaSerre_Utilisateur")->fetchAll(PDO::FETCH_ASSOC);
    }

    public function get($id){
        $stmt = $this->pdo->prepare("SELECT * FROM LaSerre_Utilisateur WHERE id=?");
        $stmt->execute([$id]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function create($data){
        $sql = "INSERT INTO LaSerre_Utilisateur (nom, prenom, mail, login, mdp, badge, role, is_banned, is_muted)
                VALUES (:nom, :prenom, :mail, :login, :mdp, :badge, :role, :is_banned, :is_muted)";
        $stmt = $this->pdo->prepare($sql);
        $data['mdp'] = password_hash($data['mdp'], PASSWORD_DEFAULT);
        $stmt->execute($data);
        return $this->pdo->lastInsertId();
    }

    public function update($id, $data){
        $sql = "UPDATE LaSerre_Utilisateur SET 
                nom=:nom, prenom=:prenom, mail=:mail, login=:login, badge=:badge,
                role=:role, is_banned=:is_banned, is_muted=:is_muted
                WHERE id=:id";
        $data['id'] = $id;
        return $this->pdo->prepare($sql)->execute($data);
    }

    public function delete($id){
        return $this->pdo->prepare("DELETE FROM LaSerre_Utilisateur WHERE id=?")->execute([$id]);
    }
}
