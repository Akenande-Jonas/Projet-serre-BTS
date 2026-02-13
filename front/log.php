<?php
    class Log {

        private $pdo;

        public function __construct($pdo){
            $this->pdo = $pdo;
        }

        public function getAll(){
            return $this->pdo->query("SELECT * FROM LaSerre_Log")->fetchAll(PDO::FETCH_ASSOC);
        }

        public function get($id){
            $stmt = $this->pdo->prepare("SELECT * FROM LaSerre_Log WHERE id=?");
            $stmt->execute([$id]);
            return $stmt->fetch(PDO::FETCH_ASSOC);
        }

        public function create($data){
            $sql = "INSERT INTO LaSerre_Log (action, date, utilisateur_id)
                    VALUES (:action, :date, :utilisateur_id)";
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($data);
            return $this->pdo->lastInsertId();
        }

        public function delete($id){
            return $this->pdo->prepare("DELETE FROM LaSerre_Log WHERE id=?")->execute([$id]);
    }
    }
?>