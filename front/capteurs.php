<?php
    class Capteurs {

        private $pdo;

        public function __construct($pdo){
            $this->pdo = $pdo;
        }

        public function getAll(){
            return $this->pdo->query("SELECT * FROM LaSerre_capteurs")->fetchAll(PDO::FETCH_ASSOC);
        }

        public function get($id){
            $stmt = $this->pdo->prepare("SELECT * FROM LaSerre_capteurs WHERE id=?");
            $stmt->execute([$id]);
            return $stmt->fetch(PDO::FETCH_ASSOC);
        }

        public function create($data){
            $sql = "INSERT INTO LaSerre_capteurs (temperature, h1, h2, h3, humidite_moyenne, timestamp)
                    VALUES (:temperature, :h1, :h2, :h3, :humidite_moyenne, :timestamp)";
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($data);
            return $this->pdo->lastInsertId();
    }
    }
?>